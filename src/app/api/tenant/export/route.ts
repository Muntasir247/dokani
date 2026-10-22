import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
    const tenantId = searchParams.get("tenant_id") || user.user_metadata?.tenant_id;

    if (!tenantId) {
      return NextResponse.json({ error: "Tenant ID required" }, { status: 400 });
    }

    // Verify user belongs to this tenant and has admin or owner role
    const { data: membership } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .maybeSingle()) as { data: { role: string } | null };

    if (!membership || !["owner", "manager"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Forbidden: Exporting full tenant data requires owner or manager privileges" },
        { status: 403 }
      );
    }

    const admin = createAdminClient();

    // Fetch all primary tenant entities
    const [
      tenantRes,
      branchesRes,
      categoriesRes,
      productsRes,
      customersRes,
      salesRes,
      saleItemsRes,
      stockMovementsRes,
      shiftsRes,
      shipmentsRes,
    ] = await Promise.all([
      admin.from("tenants").select("*").eq("id", tenantId).single(),
      admin.from("stores").select("*").eq("tenant_id", tenantId),
      admin.from("categories").select("*").eq("tenant_id", tenantId),
      admin.from("products").select("*").eq("tenant_id", tenantId),
      admin.from("customers").select("*").eq("tenant_id", tenantId),
      admin.from("sales").select("*").eq("tenant_id", tenantId),
      admin.from("sale_items").select("*").eq("tenant_id", tenantId),
      admin.from("stock_movements").select("*").eq("tenant_id", tenantId),
      admin.from("cash_drawer_sessions").select("*").eq("tenant_id", tenantId),
      admin.from("shipments").select("*").eq("tenant_id", tenantId),
    ]);

    const exportBundle = {
      version: "1.0",
      exportTimestamp: new Date().toISOString(),
      tenant: tenantRes.data,
      metadata: {
        branchesCount: branchesRes.data?.length || 0,
        productsCount: productsRes.data?.length || 0,
        customersCount: customersRes.data?.length || 0,
        salesCount: salesRes.data?.length || 0,
        stockMovementsCount: stockMovementsRes.data?.length || 0,
        shipmentsCount: shipmentsRes.data?.length || 0,
      },
      data: {
        branches: branchesRes.data || [],
        categories: categoriesRes.data || [],
        products: productsRes.data || [],
        customers: customersRes.data || [],
        sales: salesRes.data || [],
        saleItems: saleItemsRes.data || [],
        stockMovements: stockMovementsRes.data || [],
        cashDrawerSessions: shiftsRes.data || [],
        shipments: shipmentsRes.data || [],
      },
    };

    const filename = `dokani-export-${tenantId}-${Date.now()}.json`;

    return new NextResponse(JSON.stringify(exportBundle, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
