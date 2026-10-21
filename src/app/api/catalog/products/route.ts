import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sanitizeVariantForRole } from "@/lib/auth/permissions";
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

    // Fetch products and their variants under RLS
    const { data: products, error: prodError } = (await supabase
      .from("products")
      .select(`
        id,
        name,
        description,
        unit,
        is_active,
        product_variants (
          id,
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
      .is("deleted_at", null)) as {
      data: Array<{
        id: string;
        name: string;
        description: string | null;
        unit: string;
        is_active: boolean;
        product_variants: Array<{
          id: string;
          name: string;
          sku: string;
          barcode: string | null;
          cost_price: number;
          retail_price: number;
          wholesale_price: number;
          tax_rate: number;
          reorder_point: number;
        }>;
      }> | null;
      error: { message: string } | null;
    };

    if (prodError) {
      return NextResponse.json({ error: prodError.message }, { status: 400 });
    }

    // Role-based masking: Cashiers must NEVER see cost_price
    const sanitizedProducts = (products || []).map((product) => ({
      ...product,
      product_variants: (product.product_variants || []).map((variant) =>
        sanitizeVariantForRole(variant, role)
      ),
    }));

    return NextResponse.json({ products: sanitizedProducts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
