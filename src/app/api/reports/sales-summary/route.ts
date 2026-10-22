import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { UserRole } from "@/types/database.types";
import { assertFeatureEnabled } from "@/lib/billing/guard";

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

    // Enforce manager/owner permission guard
    if (!can(role, "view:reports")) {
      return NextResponse.json(
        { error: "Forbidden: Cashiers do not have permission to view sales reports" },
        { status: 403 }
      );
    }

    // Retrieve aggregate sales under RLS
    const { data: sales, error: salesError } = (await supabase
      .from("sales")
      .select("total_amount, paid_amount, due_amount, sold_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)) as {
      data: Array<{
        total_amount: number;
        paid_amount: number;
        due_amount: number;
        sold_at: string;
      }> | null;
      error: { message: string } | null;
    };

    if (salesError) {
      return NextResponse.json({ error: salesError.message }, { status: 400 });
    }

    let totalRevenuePoisha = 0;
    let totalPaidPoisha = 0;
    let totalDuePoisha = 0;

    for (const s of sales || []) {
      totalRevenuePoisha += s.total_amount;
      totalPaidPoisha += s.paid_amount;
      totalDuePoisha += s.due_amount;
    }

    const exportFormat = searchParams.get("export");
    if (exportFormat === "csv") {
      await assertFeatureEnabled(supabase, tenantId, "exportReports");
      const csvHeader = "Invoice Sold At,Total (BDT),Paid (BDT),Due (BDT)\n";
      const csvRows = (sales || [])
        .map(
          (s) =>
            `"${s.sold_at}",${(s.total_amount / 100).toFixed(2)},${(s.paid_amount / 100).toFixed(2)},${(s.due_amount / 100).toFixed(2)}`
        )
        .join("\n");

      return new NextResponse(csvHeader + csvRows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="sales-summary-${tenantId}.csv"`,
        },
      });
    }

    return NextResponse.json({
      summary: {
        totalSalesCount: (sales || []).length,
        totalRevenuePoisha,
        totalPaidPoisha,
        totalDuePoisha,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
