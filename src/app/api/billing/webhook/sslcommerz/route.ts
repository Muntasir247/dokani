import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";
import { SslCommerzProvider } from "@/lib/billing/providers/sslcommerz";
import { getPlanConfig } from "@/lib/billing/plan-config";
import { getEmailProvider, generatePaymentReceivedEmailHtml } from "@/lib/email";
import { Json } from "@/types/database.types";

const sslProvider = new SslCommerzProvider();

async function handleSslCommerzPayload(payload: Record<string, unknown>, req: NextRequest) {
  const supabase = await createServerSupabaseClient();

  // 1. Verify webhook signature and status
  const verification = await sslProvider.verifyWebhookOrIPN(payload);

  if (!verification.isValid) {
    // Log failed attempt
    await (supabase.from("payment_webhooks_log") as any).insert({
      provider: "sslcommerz",
      idempotency_key: verification.idempotencyKey || `forged_${Date.now()}`,
      event_type: "IPN",
      status: "failed",
      payload: payload as Json,
      error_message: verification.errorMessage || "Signature verification failed",
    });

    return NextResponse.json(
      { error: verification.errorMessage || "Forged or invalid webhook signature" },
      { status: 400 }
    );
  }

  // 2. Idempotency Check: prevent duplicate processing or double crediting
  const { data: existingLog } = await supabase
    .from("payment_webhooks_log")
    .select("status")
    .eq("idempotency_key", verification.idempotencyKey)
    .maybeSingle();

  if (existingLog) {
    // Already processed or duplicate
    return NextResponse.json(
      { message: "Duplicate webhook: transaction already processed", idempotencyKey: verification.idempotencyKey },
      { status: 200 }
    );
  }

  // If transaction status is not paid (e.g. failed or canceled)
  if (!verification.isPaid) {
    await (supabase.from("payment_webhooks_log") as any).insert({
      provider: "sslcommerz",
      idempotency_key: verification.idempotencyKey,
      event_type: "IPN",
      status: "failed",
      payload: payload as Json,
      error_message: `Transaction status was ${verification.rawStatus}`,
    });

    return NextResponse.json(
      { message: `Transaction recorded as unpaid (${verification.rawStatus})` },
      { status: 200 }
    );
  }

  const planConfig = getPlanConfig(verification.planTier);

  // 3. Record Subscription Payment Atomically
  const { data: rpcResult, error: rpcError } = await callRpc<{
    success: boolean;
    invoice_number: string;
    period_end: string;
    duplicate?: boolean;
  }>(supabase, "fn_record_subscription_payment", {
    p_tenant_id: verification.tenantId,
    p_plan: verification.planTier,
    p_interval: verification.billingInterval,
    p_amount_poisha: verification.amountPoisha,
    p_provider: "sslcommerz",
    p_transaction_id: verification.transactionId,
    p_payload: payload,
    p_max_stores: planConfig.limits.maxStores,
    p_max_products: planConfig.limits.maxProducts,
    p_max_staff: planConfig.limits.maxStaff,
  });

  if (rpcError) {
    await (supabase.from("payment_webhooks_log") as any).insert({
      provider: "sslcommerz",
      idempotency_key: verification.idempotencyKey,
      event_type: "IPN",
      status: "failed",
      payload: payload as Json,
      error_message: rpcError.message,
    });
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  // 4. Mark Webhook as Processed
  await (supabase.from("payment_webhooks_log") as any).insert({
    provider: "sslcommerz",
    idempotency_key: verification.idempotencyKey,
    event_type: "IPN",
    status: "processed",
    payload: payload as Json,
  });

  // 5. Send Transactional Receipt Email
  const { data: tenant } = (await supabase
    .from("tenants")
    .select("name")
    .eq("id", verification.tenantId)
    .maybeSingle()) as { data: { name: string } | null };

  const customerEmail = String(payload.cus_email || "");
  if (customerEmail) {
    const emailHtml = generatePaymentReceivedEmailHtml({
      userName: String(payload.cus_name || "Shop Owner"),
      storeName: tenant?.name || "Your Store",
      invoiceNumber: rpcResult?.invoice_number || verification.transactionId,
      amountBdt: (verification.amountPoisha / 100).toFixed(2),
      planName: planConfig.name,
      periodEnd: new Date(rpcResult?.period_end || Date.now()).toLocaleDateString("en-GB"),
      invoiceUrl: `${req.nextUrl.origin}/settings/billing`,
    });

    await getEmailProvider().sendEmail({
      to: customerEmail,
      subject: `Payment Confirmed — Dokani ${planConfig.name}`,
      html: emailHtml,
    });
  }

  return NextResponse.json({
    success: true,
    invoiceNumber: rpcResult?.invoice_number,
    message: "Subscription activated successfully",
  });
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let payload: Record<string, unknown> = {};

    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else {
      const formData = await req.formData();
      formData.forEach((val, key) => {
        payload[key] = val.toString();
      });
    }

    const res = await handleSslCommerzPayload(payload, req);

    // If browser redirect from SSLCommerz success page
    if (payload.status === "VALID" && !req.headers.get("accept")?.includes("application/json")) {
      return NextResponse.redirect(new URL("/settings/billing?status=success", req.url));
    }

    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const payload: Record<string, unknown> = {};
    searchParams.forEach((val, key) => {
      payload[key] = val;
    });

    if (payload.status === "success") {
      return NextResponse.redirect(new URL("/settings/billing?status=success", req.url));
    }

    return NextResponse.json({ message: "SSLCommerz callback received" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
