import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { UserRole } from "@/types/database.types";
import { assertFeatureEnabled } from "@/lib/billing/guard";
import { generateCsv } from "@/features/reports/csv-export";
import { DeadStockItem } from "@/features/reports/types";
import { callRpc } from "@/lib/supabase/rpc";

export async function GET(req: NextRequest) {
  try {
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
    const daysThreshold = parseInt(searchParams.get("days") || "30", 10);
    const storeId = searchParams.get("storeId");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId parameter is required" }, { status: 400 });
    }

    // Check membership and role
    const { data: memberData, error: memberError } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null; error: { message: string } | null };

    if (memberError || !memberData) {
      return NextResponse.json({ error: "Forbidden: Not a store member" }, { status: 403 });
    }

    const role = memberData.role;

    if (!can(role, "view:reports")) {
      return NextResponse.json(
        { error: "Forbidden: Cashiers do not have permission to view dead stock reports" },
        { status: 403 }
      );
    }

    const { data: deadStockData, error: rpcError } = await callRpc<
      Array<{
        product_name: string;
        variant_id: string;
        sku: string;
        barcode: string | null;
        category_name: string;
        current_stock: number;
        unit_cost_poisha: number;
        dead_stock_value_poisha: number;
        last_sold_at: string | null;
        days_without_sales: number;
      }>
    >(supabase, "fn_get_dead_stock", {
      p_tenant_id: tenantId,
      p_store_id: storeId || null,
      p_days_threshold: daysThreshold,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    const items: DeadStockItem[] = (deadStockData || []).map((d) => ({
      productName: d.product_name,
      variantId: d.variant_id,
      sku: d.sku,
      barcode: d.barcode,
      categoryName: d.category_name,
      currentStock: d.current_stock,
      unitCostPoisha: d.unit_cost_poisha,
      deadStockValuePoisha: d.dead_stock_value_poisha,
      lastSoldAt: d.last_sold_at,
      daysWithoutSales: d.days_without_sales,
    }));

    // CSV export
    if (searchParams.get("export") === "csv") {
      await assertFeatureEnabled(supabase, tenantId, "exportReports");
      const csv = generateCsv<DeadStockItem>(
        [
          { header: "Product Name", accessor: (i) => i.productName },
          { header: "SKU", accessor: (i) => i.sku },
          { header: "Barcode", accessor: (i) => i.barcode || "" },
          { header: "Category", accessor: (i) => i.categoryName },
          { header: "Unsold Units", accessor: (i) => i.currentStock },
          { header: "Unit Cost (BDT)", accessor: (i) => (i.unitCostPoisha / 100).toFixed(2) },
          { header: "Trapped Capital (BDT)", accessor: (i) => (i.deadStockValuePoisha / 100).toFixed(2) },
          { header: "Last Sale Date", accessor: (i) => i.lastSoldAt || "Never" },
          { header: "Days Inactive", accessor: (i) => i.daysWithoutSales >= 9999 ? "Never Sold" : i.daysWithoutSales },
        ],
        items
      );

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="dead-stock-${daysThreshold}days-${tenantId}.csv"`,
        },
      });
    }

    let totalTrappedCapitalPoisha = 0;
    let totalUnsoldUnits = 0;
    for (const item of items) {
      totalTrappedCapitalPoisha += item.deadStockValuePoisha;
      totalUnsoldUnits += item.currentStock;
    }

    return NextResponse.json({
      daysThreshold,
      summary: {
        deadStockCount: items.length,
        totalUnsoldUnits,
        totalTrappedCapitalPoisha,
      },
      items,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
