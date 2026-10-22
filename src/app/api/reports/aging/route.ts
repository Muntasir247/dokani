import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { UserRole } from "@/types/database.types";
import { assertFeatureEnabled } from "@/lib/billing/guard";
import { generateCsv } from "@/features/reports/csv-export";
import { CustomerAgingReport, CustomerAgingDebtor } from "@/features/reports/types";
import { callRpc } from "@/lib/supabase/rpc";

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

    if (!can(role, "view:reports")) {
      return NextResponse.json(
        { error: "Forbidden: Cashiers do not have permission to view customer aging reports" },
        { status: 403 }
      );
    }

    const { data: agingData, error: rpcError } = await callRpc<CustomerAgingReport>(
      supabase,
      "fn_get_customer_aging",
      {
        p_tenant_id: tenantId,
      }
    );

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    const report: CustomerAgingReport = agingData || {
      totalDuePoisha: 0,
      agingBuckets: {
        current0To30Poisha: 0,
        days31To60Poisha: 0,
        days61To90Poisha: 0,
        days90PlusPoisha: 0,
      },
      topDebtors: [],
    };

    // CSV export
    if (searchParams.get("export") === "csv") {
      await assertFeatureEnabled(supabase, tenantId, "exportReports");
      const csv = generateCsv<CustomerAgingDebtor>(
        [
          { header: "Customer Name", accessor: (d) => d.customerName },
          { header: "Phone", accessor: (d) => d.phone || "" },
          { header: "Total Owed (BDT)", accessor: (d) => (d.totalBalancePoisha / 100).toFixed(2) },
          { header: "0-30 Days (BDT)", accessor: (d) => (d.bucket0To30 / 100).toFixed(2) },
          { header: "31-60 Days (BDT)", accessor: (d) => (d.bucket31To60 / 100).toFixed(2) },
          { header: "61-90 Days (BDT)", accessor: (d) => (d.bucket61To90 / 100).toFixed(2) },
          { header: "90+ Days (Overdue BDT)", accessor: (d) => (d.bucket90Plus / 100).toFixed(2) },
        ],
        report.topDebtors
      );

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="customer-aging-dues-${tenantId}.csv"`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
