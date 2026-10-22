import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { UserRole } from "@/types/database.types";
import { assertFeatureEnabled } from "@/lib/billing/guard";
import { generateCsv } from "@/features/reports/csv-export";
import { InventoryValuationItem } from "@/features/reports/types";

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

    // RBAC: Cashiers blocked from valuation / cost reports
    if (!can(role, "view:reports") || !can(role, "view:cost_price")) {
      return NextResponse.json(
        { error: "Forbidden: Cashiers do not have permission to view inventory valuation reports" },
        { status: 403 }
      );
    }

    // Query valuation view
    const { data: rows, error: viewError } = (await supabase
      .from("view_inventory_valuation")
      .select("*")
      .eq("tenant_id", tenantId)) as {
      data: Array<{
        tenant_id: string;
        product_name: string;
        variant_id: string;
        sku: string;
        barcode: string | null;
        category_name: string;
        brand_name: string;
        current_stock: number;
        unit_cost_poisha: number;
        unit_retail_poisha: number;
        total_cost_value_poisha: number;
        total_retail_value_poisha: number;
        potential_profit_poisha: number;
        profit_margin_percentage: number;
      }> | null;
      error: { message: string } | null;
    };

    if (viewError) {
      return NextResponse.json({ error: viewError.message }, { status: 400 });
    }

    const items: InventoryValuationItem[] = (rows || []).map((r) => ({
      tenantId: r.tenant_id,
      productName: r.product_name,
      variantId: r.variant_id,
      sku: r.sku,
      barcode: r.barcode,
      categoryName: r.category_name,
      brandName: r.brand_name,
      currentStock: r.current_stock,
      unitCostPoisha: r.unit_cost_poisha,
      unitRetailPoisha: r.unit_retail_poisha,
      totalCostValuePoisha: r.total_cost_value_poisha,
      totalRetailValuePoisha: r.total_retail_value_poisha,
      potentialProfitPoisha: r.potential_profit_poisha,
      marginPercentage: r.profit_margin_percentage,
    }));

    // CSV export
    if (searchParams.get("export") === "csv") {
      await assertFeatureEnabled(supabase, tenantId, "exportReports");
      const csv = generateCsv<InventoryValuationItem>(
        [
          { header: "Product Name", accessor: (i) => i.productName },
          { header: "SKU", accessor: (i) => i.sku },
          { header: "Barcode", accessor: (i) => i.barcode || "" },
          { header: "Category", accessor: (i) => i.categoryName },
          { header: "Brand", accessor: (i) => i.brandName },
          { header: "Stock Qty", accessor: (i) => i.currentStock },
          { header: "Unit Cost (BDT)", accessor: (i) => (i.unitCostPoisha / 100).toFixed(2) },
          { header: "Retail Price (BDT)", accessor: (i) => (i.unitRetailPoisha / 100).toFixed(2) },
          { header: "Total Cost Value (BDT)", accessor: (i) => (i.totalCostValuePoisha / 100).toFixed(2) },
          { header: "Total Retail Value (BDT)", accessor: (i) => (i.totalRetailValuePoisha / 100).toFixed(2) },
          { header: "Potential Profit (BDT)", accessor: (i) => (i.potentialProfitPoisha / 100).toFixed(2) },
          { header: "Margin %", accessor: (i) => `${i.marginPercentage}%` },
        ],
        items
      );

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="inventory-valuation-${tenantId}.csv"`,
        },
      });
    }

    // Calculate overall summaries
    let totalCostPoisha = 0;
    let totalRetailPoisha = 0;
    for (const item of items) {
      totalCostPoisha += item.totalCostValuePoisha;
      totalRetailPoisha += item.totalRetailValuePoisha;
    }
    const totalPotentialProfitPoisha = totalRetailPoisha - totalCostPoisha;
    const overallMargin =
      totalRetailPoisha > 0
        ? Number(((totalPotentialProfitPoisha / totalRetailPoisha) * 100).toFixed(2))
        : 0;

    return NextResponse.json({
      summary: {
        totalItemsCount: items.length,
        totalCostPoisha,
        totalRetailPoisha,
        totalPotentialProfitPoisha,
        overallMargin,
      },
      items,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
