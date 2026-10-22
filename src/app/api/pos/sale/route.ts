import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSaleSchema } from "@/lib/validation/pos";
import { callRpc } from "@/lib/supabase/rpc";
import { UserRole } from "@/types/database.types";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = createSaleSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Verify tenant membership
    const { data: memberData } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", data.tenant_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!memberData) {
      return NextResponse.json({ error: "Forbidden: Not a member of this store" }, { status: 403 });
    }

    // Call atomic Postgres transactional function fn_create_sale
    // Server-side validates stock, recalculates prices, prevents overselling via locks
    const { data: saleResult, error: rpcError } = await callRpc(supabase, "fn_create_sale", {
      p_tenant_id: data.tenant_id,
      p_store_id: data.store_id,
      p_location_id: data.location_id,
      p_customer_id: data.customer_id || null,
      p_cashier_id: data.cashier_id || user.id,
      p_items: data.items,
      p_cart_discount_type: data.cart_discount_type,
      p_cart_discount_value: data.cart_discount_value,
      p_payments: data.payments,
      p_notes: data.notes || null,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    // Asynchronous Alert Triggers: Large Discount & Low Stock
    const saleObj = saleResult as Record<string, unknown> | null;
    if (saleObj) {
      const discountPoisha = Number(saleObj.discount_amount || 0);
      const totalPoisha = Number(saleObj.total_amount || 0);
      const subtotalPoisha = Number(saleObj.subtotal || 0);
      const discountPct = subtotalPoisha > 0 ? Math.round((discountPoisha / subtotalPoisha) * 100) : 0;

      // Trigger large discount notification if >= 20% or >= 500 BDT (50,000 poisha)
      if (discountPct >= 20 || discountPoisha >= 50000) {
        import("@/lib/notifications/notifier").then(({ NotificationService }) => {
          NotificationService.notifyLargeDiscount({
            tenantId: data.tenant_id,
            invoiceNumber: String(saleObj.invoice_number || "POS-SALE"),
            discountAmountPoisha: discountPoisha,
            discountPercentage: discountPct,
            totalAmountPoisha: totalPoisha,
            cashierName: user.email || "Cashier",
          }).catch((err) => console.warn("Failed to dispatch large discount alert:", err));
        });
      }

      // Trigger outgoing webhook for subscribers
      import("@/lib/webhooks/dispatcher").then(({ webhookDispatcher }) => {
        webhookDispatcher.dispatchEvent(data.tenant_id, "sale.created", saleObj)
          .catch((err) => console.warn("Failed to dispatch sale.created webhook:", err));
      });
    }

    return NextResponse.json({ sale: saleResult }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
