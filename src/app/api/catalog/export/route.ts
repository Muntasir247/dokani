import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { exportProductsToCSV } from "@/lib/catalog/csv";

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

    // Fetch products and variants
    const { data: rawProducts, error } = await supabase
      .from("products")
      .select(`
        name,
        unit,
        has_serials,
        warranty_months,
        categories ( name ),
        brands ( name ),
        product_variants (
          name,
          sku,
          barcode,
          cost_price,
          retail_price,
          wholesale_price,
          tax_rate,
          reorder_point
        )
      `)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Fetch stock levels
    const { data: stockBalances } = await (supabase
      .from("view_current_stock") as any)
      .select("sku, current_stock")
      .eq("tenant_id", tenantId);

    const stockMap = new Map<string, number>();
    ((stockBalances as Array<{ sku: string; current_stock: number }>) || []).forEach((sb) => {
      stockMap.set(sb.sku, (stockMap.get(sb.sku) || 0) + sb.current_stock);
    });

    const productsForExport = (rawProducts || []).map((p) => {
      const castP = p as unknown as {
        name: string;
        unit: string;
        has_serials: boolean;
        warranty_months: number;
        categories: { name: string } | null;
        brands: { name: string } | null;
        product_variants: Array<{
          name: string;
          sku: string;
          barcode: string | null;
          cost_price: number;
          retail_price: number;
          wholesale_price: number;
          tax_rate: number;
          reorder_point: number;
        }>;
      };

      return {
        name: castP.name,
        category: castP.categories?.name || null,
        brand: castP.brands?.name || null,
        unit: castP.unit,
        has_serials: castP.has_serials,
        warranty_months: castP.warranty_months,
        variants: castP.product_variants.map((v) => ({
          ...v,
          current_stock: stockMap.get(v.sku) ?? 0,
        })),
      };
    });

    const csvData = exportProductsToCSV(productsForExport);

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="products_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
