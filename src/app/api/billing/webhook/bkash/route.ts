import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";
import { BkashProvider } from "@/lib/billing/providers/bkash";
import { getPlanConfig } from "@/lib/billing/plan-config";
import { Json } from "@/types/database.types";

const bkashProvider = new BkashProvider();

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const supabase = await createServerSupabaseClient();

    // 1. Verify payload
    const verification = await bkashProvider.verifyWebhookOrIPN(payload);

    if (!verification.isValid) {
      await (supabase.from("payment_webhooks_log") as any).insert({
        provider: "bkash",
        idempotency_key: verification.idempotencyKey || `forged_bkash_${Date.now()}`,
        event_type: "CALLBACK",
        status: "failed",
        payload: payload as Json,
        error_message: verification.errorMessage || "bKash verification failed",
      });

      return NextResponse.json({ error: verification.errorMessage }, { status: 400 });
    }

    // 2. Idempotency Check
    const { data: existingLog } = await supabase
      .from("payment_webhooks_log")
      .select("status")
      .eq("idempotency_key", verification.idempotencyKey)
      .maybeSingle();

    if (existingLog) {
      return NextResponse.json(
        { message: "Duplicate bKash callback: already processed", idempotencyKey: verification.idempotencyKey },
        { status: 200 }
      );
    }

    if (!verification.isPaid) {
      await (supabase.from("payment_webhooks_log") as any).insert({
        provider: "bkash",
        idempotency_key: verification.idempotencyKey,
        event_type: "CALLBACK",
        status: "failed",
        payload: payload as Json,
        error_message: `bKash payment failed with status ${verification.rawStatus}`,
      });

      return NextResponse.json({ message: "bKash payment failed or was canceled" }, { status: 200 });
    }

    const planConfig = getPlanConfig(verification.planTier);

    // 3. Record Subscription Payment
    const { data: rpcResult, error: rpcError } = await callRpc<{
      success: boolean;
      invoice_number: string;
      period_end: string;
    }>(supabase, "fn_record_subscription_payment", {
      p_tenant_id: verification.tenantId,
      p_plan: verification.planTier,
      p_interval: verification.billingInterval,
      p_amount_poisha: verification.amountPoisha,
      p_provider: "bkash",
      p_transaction_id: verification.transactionId,
      p_payload: payload,
      p_max_stores: planConfig.limits.maxStores,
      p_max_products: planConfig.limits.maxProducts,
      p_max_staff: planConfig.limits.maxStaff,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    // 4. Mark Log as Processed
    await (supabase.from("payment_webhooks_log") as any).insert({
      provider: "bkash",
      idempotency_key: verification.idempotencyKey,
      event_type: "CALLBACK",
      status: "processed",
      payload: payload as Json,
    });

    return NextResponse.json({
      success: true,
      invoiceNumber: rpcResult?.invoice_number,
      message: "bKash subscription payment processed successfully",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  if (status === "success") {
    return NextResponse.redirect(new URL("/settings/billing?status=success", req.url));
  }
  return NextResponse.redirect(new URL("/settings/billing?status=failed", req.url));
}
