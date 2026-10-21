import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || req.headers.get("x-tenant-id");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId parameter is required" }, { status: 400 });
    }

    // Query sale with items, customer, and payments
    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .select(`
        *,
        customers (id, name, phone, address),
        stores (id, name, code, phone, address),
        sale_items (
          id,
          variant_id,
          quantity,
          unit_price,
          unit_cost,
          discount_amount,
          tax_amount,
          subtotal,
          serial_numbers,
          product_variants (
            id,
            name,
            sku,
            barcode,
            products (name)
          )
        ),
        sale_payments (
          id,
          method,
          amount,
          reference,
          paid_at
        )
      `)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .maybeSingle();

    if (saleErr || !sale) {
      return NextResponse.json({ error: saleErr?.message || "Sale not found" }, { status: 404 });
    }

    return NextResponse.json({ sale });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
