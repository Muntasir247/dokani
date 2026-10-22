import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatPoisha } from "@/lib/receipts/templates";
import { Database, UserRole } from "@/types/database.types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch subscription invoice
    const { data: inv, error: invError } = (await supabase
      .from("subscription_invoices")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle()) as {
      data: Database["public"]["Tables"]["subscription_invoices"]["Row"] | null;
      error: unknown;
    };

    if (invError || !inv) {
      return NextResponse.json({ error: "Subscription invoice not found" }, { status: 404 });
    }

    // Verify member permissions
    const { data: member } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", inv.tenant_id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!member) {
      return NextResponse.json({ error: "Forbidden: Not a tenant member" }, { status: 403 });
    }

    const { data: tenant } = (await supabase
      .from("tenants")
      .select("name, slug")
      .eq("id", inv.tenant_id)
      .maybeSingle()) as { data: { name: string; slug: string } | null };

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Subscription Receipt #${inv.invoice_number}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 20px; max-width: 800px; margin: 0 auto; }
    .header { border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #f1f5f9; padding: 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; }
    td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    .total-row { font-size: 16px; font-weight: bold; color: #0f172a; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 style="margin: 0; font-size: 24px; color: #0284c7;">Dokani Cloud POS</h1>
      <div style="font-size: 12px; color: #64748b; margin-top: 4px;">SaaS Subscription Invoice</div>
      <div style="font-size: 11px; color: #64748b;">Merchant: <strong>${tenant?.name || "Dokani Merchant"}</strong></div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 18px; font-weight: bold; color: #0f172a;"># ${inv.invoice_number}</div>
      <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Date: ${new Date(inv.paid_at || inv.created_at).toLocaleDateString("en-GB")}</div>
      <div style="font-size: 11px; color: #16a34a; font-weight: bold; text-transform: uppercase;">Status: ${inv.status}</div>
    </div>
  </div>

  <div class="meta-box">
    <div style="font-size: 12px; color: #475569;">
      <strong>Billing Period:</strong> ${new Date(inv.period_start).toLocaleDateString("en-GB")} to ${new Date(inv.period_end).toLocaleDateString("en-GB")} (${inv.billing_interval}ly)<br />
      <strong>Payment Method:</strong> ${inv.payment_provider.toUpperCase()} (Ref: ${inv.provider_transaction_id || "Direct"})
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="width: 100px; text-align: center;">Interval</th>
        <th style="width: 120px; text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <strong>Dokani ${inv.plan_tier.toUpperCase()} Plan Subscription</strong>
          <div style="font-size: 11px; color: #64748b;">Cloud POS workstation, multi-branch, and inventory sync</div>
        </td>
        <td style="text-align: center; text-transform: capitalize;">${inv.billing_interval}</td>
        <td style="text-align: right; font-family: monospace; font-weight: 600;">${formatPoisha(inv.amount_poisha)}</td>
      </tr>
      <tr class="total-row">
        <td colspan="2" style="text-align: right; border: none; padding-top: 16px;">Total Paid:</td>
        <td style="text-align: right; font-family: monospace; color: #0284c7; border: none; padding-top: 16px;">
          ${formatPoisha(inv.amount_poisha)}
        </td>
      </tr>
    </tbody>
  </table>

  <div style="text-align: center; font-size: 11px; color: #94a3b8; margin-top: 40px; border-top: 1px dashed #e2e8f0; padding-top: 16px;">
    Dokani Software Services &copy; 2026. Electronic receipt generated automatically.
  </div>
</body>
</html>
    `.trim();

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
