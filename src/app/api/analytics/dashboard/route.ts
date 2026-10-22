import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { UserRole } from "@/types/database.types";
import { DashboardAnalyticsResponse } from "@/features/reports/types";
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
    const storeId = searchParams.get("storeId");
    const targetDate = searchParams.get("targetDate") || new Date().toISOString().split("T")[0];

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
    const canViewProfit = can(role, "view:reports") && can(role, "view:cost_price");

    // Execute optimized RPC
    const { data: analyticsData, error: rpcError } = await callRpc<DashboardAnalyticsResponse>(
      supabase,
      "fn_get_dashboard_analytics",
      {
        p_tenant_id: tenantId,
        p_store_id: storeId || null,
        p_target_date: targetDate,
      }
    );

    if (rpcError) {
      console.warn("[Dashboard Analytics RPC Fallback]:", rpcError.message);
    }

    const defaultMetrics: DashboardAnalyticsResponse = {
      targetDate,
      today: {
        invoices: 0,
        revenuePoisha: 0,
        costPoisha: 0,
        grossProfitPoisha: 0,
        grossMarginPercentage: 0,
        averageBasketPoisha: 0,
        paidPoisha: 0,
        duePoisha: 0,
      },
      comparison: {
        yesterdayRevenuePoisha: 0,
        yesterdayInvoices: 0,
        diffYesterdayPoisha: 0,
        pctChangeYesterday: 0,
        lastWeekRevenuePoisha: 0,
        diffLastWeekPoisha: 0,
        pctChangeLastWeek: 0,
      },
      hourlySales: Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        revenuePoisha: 0,
        invoices: 0,
      })),
      topProducts: [],
      lowStockCount: 0,
      dues: {
        pendingCustomers: 0,
        totalDuePoisha: 0,
      },
    };

    const result = (analyticsData || defaultMetrics) as DashboardAnalyticsResponse;

    // RBAC: Strip cost and profit metrics for cashiers
    if (!canViewProfit) {
      result.today.costPoisha = undefined;
      result.today.grossProfitPoisha = undefined;
      result.today.grossMarginPercentage = undefined;
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
