import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || req.headers.get("x-tenant-id");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId parameter is required" }, { status: 400 });
    }

    // Customer profile & balance
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, tenant_id, name, phone, email, address, company_name, tax_id, price_tier, credit_limit, opening_balance, loyalty_points, created_at")
      .eq("id", customerId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const { data: balanceData } = (await supabase
      .from("view_customer_balances")
      .select("current_due")
      .eq("customer_id", customerId)
      .maybeSingle()) as { data: { current_due: number } | null };

    // Sales history
    const { data: sales } = await supabase
      .from("sales")
      .select("id, invoice_number, sold_at, total_amount, paid_amount, due_amount, status, share_token")
      .eq("customer_id", customerId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("sold_at", { ascending: false })
      .limit(50);

    // Payments history
    const { data: payments } = await supabase
      .from("customer_payments")
      .select("id, amount, payment_method, reference, notes, paid_at, sale_id")
      .eq("customer_id", customerId)
      .eq("tenant_id", tenantId)
      .order("paid_at", { ascending: false })
      .limit(50);

    const safeCustomer = customer as Record<string, unknown>;

    return NextResponse.json({
      customer: {
        ...safeCustomer,
        current_due: balanceData?.current_due ?? 0,
      },
      sales: sales || [],
      payments: payments || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
