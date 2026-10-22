import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { UserRole } from "@/types/database.types";
import { assertFeatureEnabled } from "@/lib/billing/guard";
import { generateCsv } from "@/features/reports/csv-export";

interface MovementRow {
  id: string;
  createdAt: string;
  type: string;
  productName: string;
  sku: string;
  quantity: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
}

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
    const variantId = searchParams.get("variantId");
    const movementType = searchParams.get("type");
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

    if (!can(role, "view:reports")) {
      return NextResponse.json(
        { error: "Forbidden: Cashiers do not have permission to view stock movement reports" },
        { status: 403 }
      );
    }

    let query = supabase
      .from("stock_movements")
      .select(`
        id,
        created_at,
        type,
        quantity,
        reason,
        reference_type,
        reference_id,
        variant:product_variants(
          sku,
          product:products(name)
        )
      `)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (variantId) {
      query = query.eq("variant_id", variantId);
    }
    if (movementType) {
      query = query.eq("type", movementType);
    }
    if (startDate) {
      query = query.gte("created_at", `${startDate}T00:00:00Z`);
    }
    if (endDate) {
      query = query.lte("created_at", `${endDate}T23:59:59Z`);
    }

    const { data: movements, error: smError } = (await query) as {
      data: Array<{
        id: string;
        created_at: string;
        type: string;
        quantity: number;
        reason: string | null;
        reference_type: string | null;
        reference_id: string | null;
        variant: {
          sku: string;
          product: { name: string } | null;
        } | null;
      }> | null;
      error: { message: string } | null;
    };
    if (smError) {
      return NextResponse.json({ error: smError.message }, { status: 400 });
    }

    const rows: MovementRow[] = (movements || []).map((m) => {
      const variant = m.variant as unknown as { sku?: string; product?: { name?: string } };
      return {
        id: m.id,
        createdAt: m.created_at,
        type: m.type,
        productName: variant?.product?.name || "Unknown Product",
        sku: variant?.sku || "N/A",
        quantity: m.quantity,
        reason: m.reason,
        referenceType: m.reference_type,
        referenceId: m.reference_id,
      };
    });

    // CSV export
    if (searchParams.get("export") === "csv") {
      await assertFeatureEnabled(supabase, tenantId, "exportReports");
      const csv = generateCsv<MovementRow>(
        [
          { header: "Date / Time", accessor: (r) => r.createdAt },
          { header: "Type", accessor: (r) => r.type },
          { header: "Product", accessor: (r) => r.productName },
          { header: "SKU", accessor: (r) => r.sku },
          { header: "Qty Delta", accessor: (r) => r.quantity },
          { header: "Reason", accessor: (r) => r.reason || "" },
          { header: "Ref Type", accessor: (r) => r.referenceType || "" },
          { header: "Ref ID", accessor: (r) => r.referenceId || "" },
        ],
        rows
      );

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="stock-movements-${tenantId}.csv"`,
        },
      });
    }

    return NextResponse.json({
      count: rows.length,
      movements: rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
