import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/database.types";
import { assertFeatureEnabled } from "@/lib/billing/guard";
import { generateCsv } from "@/features/reports/csv-export";
import { CashDrawerShiftItem } from "@/features/reports/types";

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
    const storeId = searchParams.get("storeId");
    const cashierId = searchParams.get("cashierId");
    const status = searchParams.get("status");

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

    // Cashiers can see their own shift reports, managers/owners see all
    let query = supabase
      .from("cash_drawer_sessions")
      .select(`
        id,
        cashier_id,
        store_id,
        opened_at,
        closed_at,
        opening_float_poisha,
        closing_counted_poisha,
        expected_cash_poisha,
        cash_variance_poisha,
        status,
        notes,
        cashier:profiles!cash_drawer_sessions_cashier_id_fkey(full_name, email),
        store:stores(name)
      `)
      .eq("tenant_id", tenantId)
      .order("opened_at", { ascending: false })
      .limit(100);

    if (role === "cashier") {
      query = query.eq("cashier_id", user.id);
    } else if (cashierId) {
      query = query.eq("cashier_id", cashierId);
    }

    if (storeId) {
      query = query.eq("store_id", storeId);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data: sessions, error } = (await query) as {
      data: Array<{
        id: string;
        cashier_id: string;
        store_id: string;
        opened_at: string;
        closed_at: string | null;
        opening_float_poisha: number;
        closing_counted_poisha: number | null;
        expected_cash_poisha: number | null;
        cash_variance_poisha: number | null;
        status: string;
        notes: string | null;
        cashier: { full_name?: string; email?: string } | null;
        store: { name?: string } | null;
      }> | null;
      error: { message: string } | null;
    };
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const items: CashDrawerShiftItem[] = (sessions || []).map((s) => {
      const cashier = s.cashier as unknown as { full_name?: string; email?: string };
      const store = s.store as unknown as { name?: string };
      return {
        id: s.id,
        cashierId: s.cashier_id,
        cashierName: cashier?.full_name || cashier?.email || "Cashier",
        storeId: s.store_id,
        storeName: store?.name || "Store",
        openedAt: s.opened_at,
        closedAt: s.closed_at,
        openingFloatPoisha: s.opening_float_poisha,
        closingCountedPoisha: s.closing_counted_poisha,
        expectedCashPoisha: s.expected_cash_poisha,
        cashVariancePoisha: s.cash_variance_poisha,
        status: s.status as "open" | "closed",
        notes: s.notes,
      };
    });

    // CSV export
    if (searchParams.get("export") === "csv") {
      await assertFeatureEnabled(supabase, tenantId, "exportReports");
      const csv = generateCsv<CashDrawerShiftItem>(
        [
          { header: "Opened At", accessor: (i) => i.openedAt },
          { header: "Closed At", accessor: (i) => i.closedAt || "Still Open" },
          { header: "Cashier", accessor: (i) => i.cashierName || "" },
          { header: "Store", accessor: (i) => i.storeName || "" },
          { header: "Opening Float (BDT)", accessor: (i) => (i.openingFloatPoisha / 100).toFixed(2) },
          { header: "Expected Cash (BDT)", accessor: (i) => i.expectedCashPoisha !== null ? (i.expectedCashPoisha / 100).toFixed(2) : "N/A" },
          { header: "Counted Cash (BDT)", accessor: (i) => i.closingCountedPoisha !== null ? (i.closingCountedPoisha / 100).toFixed(2) : "N/A" },
          { header: "Variance (BDT)", accessor: (i) => i.cashVariancePoisha !== null ? (i.cashVariancePoisha / 100).toFixed(2) : "N/A" },
          { header: "Status", accessor: (i) => i.status.toUpperCase() },
          { header: "Notes", accessor: (i) => i.notes || "" },
        ],
        items
      );

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="cash-drawer-shifts-${tenantId}.csv"`,
        },
      });
    }

    return NextResponse.json({
      count: items.length,
      shifts: items,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
