import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

    const lowStockOnly = searchParams.get("lowStock") === "true";
    const locationId = searchParams.get("locationId");
    const variantId = searchParams.get("variantId");

    let query = supabase
      .from("view_current_stock")
      .select("*")
      .eq("tenant_id", tenantId);

    if (lowStockOnly) {
      query = query.eq("is_low_stock", true);
    }
    if (locationId) {
      query = query.eq("location_id", locationId);
    }
    if (variantId) {
      query = query.eq("variant_id", variantId);
    }

    const { data: stockItems, error } = (await query.order("product_name", { ascending: true })) as {
      data: Array<{ variant_id: string; is_low_stock: boolean; current_stock: number; [key: string]: unknown }> | null;
      error: { message: string } | null;
    };

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Query recent stock movements (last 20)
    const { data: recentMovements } = await supabase
      .from("stock_movements")
      .select(`
        id,
        type,
        quantity,
        unit_cost,
        notes,
        created_at,
        product_variants (
          id,
          name,
          sku,
          products ( name )
        ),
        stock_locations (
          id,
          name,
          stores ( name )
        )
      `)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      stockItems: stockItems || [],
      lowStockCount: (stockItems || []).filter((s) => s.is_low_stock).length,
      recentMovements: recentMovements || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
