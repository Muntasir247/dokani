import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiKey(req, "read:inventory");
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const storeId = searchParams.get("store_id") || searchParams.get("branch_id");
  const productId = searchParams.get("product_id");
  const lowStockOnly = searchParams.get("low_stock") === "true";

  const offset = (page - 1) * limit;
  const admin = createAdminClient();

  let queryBuilder = admin
    .from("view_current_stock")
    .select("*", { count: "exact" })
    .eq("tenant_id", auth!.tenantId);

  if (storeId) {
    queryBuilder = queryBuilder.eq("store_id", storeId);
  }
  if (productId) {
    queryBuilder = queryBuilder.eq("product_id", productId);
  }

  const { data, count, error } = await queryBuilder
    .order("product_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let items = (data || []).map((row) => {
    const isLowStock = row.current_stock <= (row.reorder_point || 5);
    return {
      product_id: row.product_id,
      variant_id: row.variant_id,
      name: row.product_name,
      variant_name: row.variant_name,
      sku: row.sku,
      barcode: row.barcode,
      store_id: row.store_id,
      store_name: row.store_name,
      current_stock: row.current_stock,
      reorder_point: row.reorder_point,
      is_low_stock: isLowStock,
      retail_price: row.retail_price,
      cost_price: row.cost_price,
      valuation: row.current_stock * Number(row.cost_price || 0),
    };
  });

  if (lowStockOnly) {
    items = items.filter((i) => i.is_low_stock);
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}
