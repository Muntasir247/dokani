import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sanitizeVariantForRole, assertPermission } from "@/lib/auth/permissions";
import { createProductSchema } from "@/lib/validation/catalog";
import { logAuditEvent } from "@/lib/audit";
import { UserRole } from "@/types/database.types";

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

    // Determine caller's role in this tenant
    const { data: memberData, error: memberError } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null; error: { message: string } | null };

    if (memberError || !memberData) {
      return NextResponse.json(
        { error: "Forbidden: You are not a member of this store" },
        { status: 403 }
      );
    }

    const role = memberData.role;

    // Filters & Pagination
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId");
    const brandId = searchParams.get("brandId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
    const offset = (page - 1) * pageSize;

    // Build query under RLS
    let query = supabase
      .from("products")
      .select(
        `
        id,
        name,
        description,
        image_url,
        unit,
        has_variants,
        has_serials,
        warranty_months,
        is_active,
        category_id,
        brand_id,
        categories ( id, name, slug ),
        brands ( id, name ),
        product_variants (
          id,
          name,
          sku,
          barcode,
          image_url,
          options,
          cost_price,
          retail_price,
          wholesale_price,
          tax_rate,
          reorder_point
        )
      `,
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }
    if (brandId) {
      query = query.eq("brand_id", brandId);
    }
    if (search.trim()) {
      query = query.ilike("name", `%${search.trim()}%`);
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);

    const { data: products, error: prodError, count } = await query;

    if (prodError) {
      return NextResponse.json({ error: prodError.message }, { status: 400 });
    }

    // Fetch stock balances for all variants in this tenant
    const { data: stockBalances } = (await supabase
      .from("view_current_stock")
      .select("variant_id, current_stock, is_low_stock")
      .eq("tenant_id", tenantId)) as {
      data: Array<{ variant_id: string; current_stock: number; is_low_stock: boolean }> | null;
    };

    const stockMap = new Map<string, { current_stock: number; is_low_stock: boolean }>();
    (stockBalances || []).forEach((sb) => {
      const existing = stockMap.get(sb.variant_id);
      const totalStock = (existing?.current_stock || 0) + sb.current_stock;
      stockMap.set(sb.variant_id, {
        current_stock: totalStock,
        is_low_stock: sb.is_low_stock,
      });
    });

    // Role-based masking & stock attachment
    const formattedProducts = (products || []).map((product) => {
      const rawProduct = product as unknown as {
        id: string;
        name: string;
        description: string | null;
        image_url: string | null;
        unit: string;
        has_variants: boolean;
        has_serials: boolean;
        warranty_months: number;
        is_active: boolean;
        category_id: string | null;
        brand_id: string | null;
        categories: { id: string; name: string; slug: string } | null;
        brands: { id: string; name: string } | null;
        product_variants: Array<{
          id: string;
          name: string;
          sku: string;
          barcode: string | null;
          image_url: string | null;
          options: unknown;
          cost_price: number;
          retail_price: number;
          wholesale_price: number;
          tax_rate: number;
          reorder_point: number;
        }>;
      };

      const enrichedVariants = (rawProduct.product_variants || []).map((variant) => {
        const stockInfo = stockMap.get(variant.id) || { current_stock: 0, is_low_stock: true };
        const sanitized = sanitizeVariantForRole(variant, role);
        return {
          ...sanitized,
          current_stock: stockInfo.current_stock,
          is_low_stock: stockInfo.current_stock <= variant.reorder_point,
        };
      });

      return {
        ...rawProduct,
        product_variants: enrichedVariants,
      };
    });

    return NextResponse.json({
      products: formattedProducts,
      totalCount: count || 0,
      page,
      pageSize,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    const parseResult = createProductSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Verify caller has manage:catalog permission
    const { data: memberData } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", data.tenant_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!memberData) {
      return NextResponse.json({ error: "Forbidden: Not a member of this tenant" }, { status: 403 });
    }

    try {
      assertPermission(memberData.role, "manage:catalog");
    } catch {
      return NextResponse.json(
        { error: "Forbidden: Cashiers cannot create or edit products" },
        { status: 403 }
      );
    }

    // Verify SKU uniqueness across proposed variants and tenant DB
    const skusToCheck = data.variants.map((v) => v.sku);
    const { data: existingSkus } = (await supabase
      .from("product_variants")
      .select("sku")
      .eq("tenant_id", data.tenant_id)
      .in("sku", skusToCheck)
      .is("deleted_at", null)) as { data: Array<{ sku: string }> | null };

    if (existingSkus && existingSkus.length > 0) {
      return NextResponse.json(
        { error: `SKU '${existingSkus[0].sku}' is already taken in this store.` },
        { status: 400 }
      );
    }

    // 1. Create Product
    const { data: newProduct, error: prodErr } = (await (supabase
      .from("products") as any)
      .insert({
        tenant_id: data.tenant_id,
        category_id: data.category_id || null,
        brand_id: data.brand_id || null,
        name: data.name,
        description: data.description || null,
        image_url: data.image_url || null,
        unit: data.unit,
        has_variants: data.has_variants,
        has_serials: data.has_serials,
        warranty_months: data.warranty_months,
        created_by: user.id,
      })
      .select()
      .single()) as { data: Record<string, unknown> & { id: string } | null; error: { message: string } | null };

    if (prodErr || !newProduct) {
      return NextResponse.json({ error: prodErr?.message || "Failed to create product" }, { status: 400 });
    }

    // 2. Resolve default stock location for initial opening stock
    const { data: defaultLocation } = (await (supabase
      .from("stock_locations") as any)
      .select("id")
      .eq("tenant_id", data.tenant_id)
      .eq("is_default", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { id: string } | null };

    // 3. Create Variants & Ledger Opening Movements
    const createdVariants: Array<Record<string, unknown>> = [];

    for (const v of data.variants) {
      const { data: newVariant, error: varErr } = (await (supabase
        .from("product_variants") as any)
        .insert({
          tenant_id: data.tenant_id,
          product_id: newProduct.id,
          name: v.name,
          sku: v.sku,
          barcode: v.barcode || null,
          image_url: v.image_url || null,
          options: (v.options || {}) as unknown as Record<string, unknown>,
          cost_price: v.cost_price,
          retail_price: v.retail_price,
          wholesale_price: v.wholesale_price,
          tax_rate: v.tax_rate,
          reorder_point: v.reorder_point,
          created_by: user.id,
        })
        .select()
        .single()) as { data: Record<string, unknown> & { id: string } | null; error: { message: string } | null };

      if (varErr || !newVariant) {
        return NextResponse.json({ error: varErr?.message || "Failed to create variant" }, { status: 400 });
      }

      createdVariants.push(newVariant);

      // Ledger movement for opening stock if > 0
      if (v.opening_stock > 0 && defaultLocation) {
        await (supabase.from("stock_movements") as any).insert({
          tenant_id: data.tenant_id,
          location_id: defaultLocation.id,
          variant_id: newVariant.id,
          type: "adjustment",
          quantity: v.opening_stock,
          unit_cost: v.cost_price,
          reference_type: "opening_stock",
          notes: "Initial opening stock",
          created_by: user.id,
        });
      }

      // Bulk serials entry if serial tracking is enabled
      if (data.has_serials && v.serials && v.serials.length > 0 && defaultLocation) {
        const serialInserts = v.serials
          .filter((s) => s.trim().length > 0)
          .map((sn) => ({
            tenant_id: data.tenant_id,
            variant_id: newVariant.id,
            stock_location_id: defaultLocation.id,
            serial_number: sn.trim(),
            status: "available" as const,
            warranty_months: data.warranty_months,
            created_by: user.id,
          }));

        if (serialInserts.length > 0) {
          await (supabase.from("product_serials") as any).insert(serialInserts);
        }
      }
    }

    // 4. Audit Log
    await logAuditEvent({
      tenantId: data.tenant_id,
      actorId: user.id,
      action: "product_created",
      entityType: "products",
      entityId: newProduct.id,
      newValues: {
        name: data.name,
        variants_count: createdVariants.length,
        has_serials: data.has_serials,
      },
    });

    return NextResponse.json({
      product: {
        ...newProduct,
        product_variants: createdVariants,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
