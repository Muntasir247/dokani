import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertCanCreateResource } from "@/lib/billing/guard";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateProductSchema = z.object({
  name: z.string().min(1, "Product name is required").max(200),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  cost_price: z.number().nonnegative().optional().default(0),
  retail_price: z.number().nonnegative(),
  category_id: z.string().uuid().optional(),
  is_active: z.boolean().optional().default(true),
  track_inventory: z.boolean().optional().default(true),
  low_stock_threshold: z.number().int().nonnegative().optional().default(5),
});

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiKey(req, "read:products");
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const query = searchParams.get("query")?.trim();
  const categoryId = searchParams.get("category_id");

  const offset = (page - 1) * limit;
  const admin = createAdminClient();

  let queryBuilder = admin
    .from("products")
    .select("id, name, category_id, is_active, created_at, updated_at, product_variants(id, sku, barcode, retail_price, cost_price, reorder_point)", { count: "exact" })
    .eq("tenant_id", auth!.tenantId);

  if (query) {
    queryBuilder = queryBuilder.ilike("name", `%${query}%`);
  }
  if (categoryId) {
    queryBuilder = queryBuilder.eq("category_id", categoryId);
  }

  const { data, count, error } = await queryBuilder
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    data: data || [],
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiKey(req, "write:products");
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const admin = createAdminClient();

  // Validate plan product quota limits
  try {
    await assertCanCreateResource(admin, auth!.tenantId, "products");
  } catch (quotaErr) {
    return NextResponse.json(
      { error: "Plan limit exceeded", message: (quotaErr as Error).message },
      { status: 403 }
    );
  }

  const { data: product, error: prodErr } = await admin
    .from("products")
    .insert({
      tenant_id: auth!.tenantId,
      name: parsed.data.name.trim(),
      category_id: parsed.data.category_id || null,
      is_active: parsed.data.is_active,
      has_variants: false,
    })
    .select()
    .single();

  if (prodErr || !product) {
    return NextResponse.json({ error: prodErr?.message || "Failed to create product" }, { status: 400 });
  }

  // Create standard variant with pricing and SKU
  const sku = parsed.data.sku || `SKU-${Date.now()}`;
  const { data: variant, error: varErr } = await admin
    .from("product_variants")
    .insert({
      tenant_id: auth!.tenantId,
      product_id: product.id,
      name: "Standard",
      sku,
      barcode: parsed.data.barcode || null,
      cost_price: parsed.data.cost_price,
      retail_price: parsed.data.retail_price,
      reorder_point: parsed.data.low_stock_threshold,
      options: {},
    })
    .select()
    .single();

  if (varErr) {
    return NextResponse.json({ error: varErr.message }, { status: 400 });
  }

  return NextResponse.json({ data: { ...product, variant } }, { status: 201 });
}
