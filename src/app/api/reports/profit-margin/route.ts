import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { UserRole } from "@/types/database.types";
import { assertFeatureEnabled } from "@/lib/billing/guard";
import { generateCsv } from "@/features/reports/csv-export";
import { ProfitMarginItem } from "@/features/reports/types";

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
    const groupBy = searchParams.get("groupBy") || "product"; // 'product' | 'category' | 'brand' | 'cashier'
    const storeId = searchParams.get("storeId");
    const cashierId = searchParams.get("cashierId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

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

    // RBAC: Cashiers must NEVER see profit or cost numbers
    if (!can(role, "view:reports") || !can(role, "view:cost_price")) {
      return NextResponse.json(
        { error: "Forbidden: Cashiers do not have permission to view profit and margin reports" },
        { status: 403 }
      );
    }

    // Build query on sale_items joined with sales, products, categories, brands, profiles
    let salesQuery = supabase
      .from("sales")
      .select(`
        id,
        sold_at,
        store_id,
        cashier_id,
        cashier:profiles!sales_cashier_id_fkey(full_name, email),
        items:sale_items(
          id,
          variant_id,
          quantity,
          unit_price,
          unit_cost,
          subtotal,
          discount_amount,
          variant:product_variants(
            sku,
            product:products(
              name,
              category:categories(name),
              brand:brands(name)
            )
          )
        )
      `)
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .is("deleted_at", null);

    if (storeId) {
      salesQuery = salesQuery.eq("store_id", storeId);
    }
    if (cashierId) {
      salesQuery = salesQuery.eq("cashier_id", cashierId);
    }
    if (startDate) {
      salesQuery = salesQuery.gte("sold_at", `${startDate}T00:00:00Z`);
    }
    if (endDate) {
      salesQuery = salesQuery.lte("sold_at", `${endDate}T23:59:59Z`);
    }

    const { data: sales, error: salesError } = (await salesQuery) as {
      data: Array<{
        id: string;
        sold_at: string;
        store_id: string;
        cashier_id: string;
        cashier: { full_name?: string; email?: string } | null;
        items: Array<{
          id: string;
          variant_id: string;
          quantity: number;
          unit_price: number;
          unit_cost: number;
          subtotal: number;
          discount_amount: number;
          variant?: {
            sku: string;
            product?: {
              name: string;
              category?: { name: string } | null;
              brand?: { name: string } | null;
            } | null;
          } | null;
        }>;
      }> | null;
      error: { message: string } | null;
    };

    if (salesError) {
      return NextResponse.json({ error: salesError.message }, { status: 400 });
    }

    // Grouping aggregator
    const groupMap = new Map<string, ProfitMarginItem>();

    for (const sale of sales || []) {
      const cashierName =
        (sale.cashier as unknown as { full_name?: string })?.full_name || "Unknown Cashier";

      for (const item of (sale.items as unknown as Array<{
        quantity: number;
        unit_price: number;
        unit_cost: number;
        subtotal: number;
        variant?: {
          sku: string;
          product?: {
            name: string;
            category?: { name: string };
            brand?: { name: string };
          };
        };
      }>) || []) {
        const prodName = item.variant?.product?.name || "Unknown Product";
        const categoryName = item.variant?.product?.category?.name || "Uncategorized";
        const brandName = item.variant?.product?.brand?.name || "Generic";
        const sku = item.variant?.sku || "SKU";

        let key = "";
        let displayName = "";

        if (groupBy === "category") {
          key = categoryName;
          displayName = categoryName;
        } else if (groupBy === "brand") {
          key = brandName;
          displayName = brandName;
        } else if (groupBy === "cashier") {
          key = (sale.cashier_id as string) || "cashier";
          displayName = cashierName;
        } else {
          // Default: by product
          key = `${prodName}_${sku}`;
          displayName = `${prodName} (${sku})`;
        }

        const rev = item.subtotal;
        const cogs = item.quantity * item.unit_cost; // Exact cost at time of sale!

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            key,
            name: displayName,
            category: categoryName,
            brand: brandName,
            quantitySold: 0,
            revenuePoisha: 0,
            costPoisha: 0,
            grossProfitPoisha: 0,
            marginPercentage: 0,
          });
        }

        const entry = groupMap.get(key)!;
        entry.quantitySold += item.quantity;
        entry.revenuePoisha += rev;
        entry.costPoisha += cogs;
        entry.grossProfitPoisha = entry.revenuePoisha - entry.costPoisha;
        entry.marginPercentage =
          entry.revenuePoisha > 0
            ? Number(((entry.grossProfitPoisha / entry.revenuePoisha) * 100).toFixed(2))
            : 0;
      }
    }

    const items = Array.from(groupMap.values()).sort(
      (a, b) => b.grossProfitPoisha - a.grossProfitPoisha
    );

    // CSV export
    if (searchParams.get("export") === "csv") {
      await assertFeatureEnabled(supabase, tenantId, "exportReports");
      const csv = generateCsv<ProfitMarginItem>(
        [
          { header: groupBy.toUpperCase(), accessor: (i) => i.name },
          { header: "Qty Sold", accessor: (i) => i.quantitySold },
          { header: "Revenue (BDT)", accessor: (i) => (i.revenuePoisha / 100).toFixed(2) },
          { header: "Cost of Goods (BDT)", accessor: (i) => (i.costPoisha / 100).toFixed(2) },
          { header: "Gross Profit (BDT)", accessor: (i) => (i.grossProfitPoisha / 100).toFixed(2) },
          { header: "Margin %", accessor: (i) => `${i.marginPercentage}%` },
        ],
        items
      );

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="profit-margin-by-${groupBy}-${tenantId}.csv"`,
        },
      });
    }

    let totalRevenuePoisha = 0;
    let totalCostPoisha = 0;
    for (const item of items) {
      totalRevenuePoisha += item.revenuePoisha;
      totalCostPoisha += item.costPoisha;
    }
    const totalGrossProfitPoisha = totalRevenuePoisha - totalCostPoisha;
    const overallMargin =
      totalRevenuePoisha > 0
        ? Number(((totalGrossProfitPoisha / totalRevenuePoisha) * 100).toFixed(2))
        : 0;

    return NextResponse.json({
      groupBy,
      summary: {
        totalRevenuePoisha,
        totalCostPoisha,
        totalGrossProfitPoisha,
        overallMargin,
      },
      items,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
