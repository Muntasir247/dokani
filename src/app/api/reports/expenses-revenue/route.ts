import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { UserRole } from "@/types/database.types";
import { assertFeatureEnabled } from "@/lib/billing/guard";
import { generateCsv } from "@/features/reports/csv-export";
import { ExpensesVsRevenueReport } from "@/features/reports/types";

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
    const startDate = searchParams.get("startDate") || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const endDate = searchParams.get("endDate") || new Date().toISOString().split("T")[0];

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

    if (!can(role, "view:reports") || !can(role, "view:cost_price")) {
      return NextResponse.json(
        { error: "Forbidden: Cashiers do not have permission to view financial P&L reports" },
        { status: 403 }
      );
    }

    // 1. Fetch Sales & COGS in period
    let salesQuery = supabase
      .from("sales")
      .select(`
        total_amount,
        items:sale_items(quantity, unit_cost)
      `)
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("sold_at", `${startDate}T00:00:00Z`)
      .lte("sold_at", `${endDate}T23:59:59Z`)
      .is("deleted_at", null);

    if (storeId) {
      salesQuery = salesQuery.eq("store_id", storeId);
    }

    const { data: sales, error: salesError } = (await salesQuery) as {
      data: Array<{
        total_amount: number;
        items: Array<{ quantity: number; unit_cost: number }>;
      }> | null;
      error: { message: string } | null;
    };
    if (salesError) {
      return NextResponse.json({ error: salesError.message }, { status: 400 });
    }

    let grossRevenuePoisha = 0;
    let costOfGoodsSoldPoisha = 0;

    for (const sale of sales || []) {
      grossRevenuePoisha += sale.total_amount;
      for (const item of (sale.items as Array<{ quantity: number; unit_cost: number }>) || []) {
        costOfGoodsSoldPoisha += item.quantity * item.unit_cost;
      }
    }

    const grossProfitPoisha = grossRevenuePoisha - costOfGoodsSoldPoisha;
    const grossMarginPct =
      grossRevenuePoisha > 0
        ? Number(((grossProfitPoisha / grossRevenuePoisha) * 100).toFixed(2))
        : 0;

    // 2. Fetch Operating Expenses in period
    let expQuery = supabase
      .from("expenses")
      .select("category, amount")
      .eq("tenant_id", tenantId)
      .gte("expense_date", startDate)
      .lte("expense_date", endDate)
      .is("deleted_at", null);

    if (storeId) {
      expQuery = expQuery.eq("store_id", storeId);
    }

    const { data: expenses, error: expError } = (await expQuery) as {
      data: Array<{ category: string; amount: number }> | null;
      error: { message: string } | null;
    };
    if (expError) {
      return NextResponse.json({ error: expError.message }, { status: 400 });
    }

    let totalExpensesPoisha = 0;
    const catMap = new Map<string, number>();

    for (const exp of expenses || []) {
      totalExpensesPoisha += exp.amount;
      catMap.set(exp.category, (catMap.get(exp.category) || 0) + exp.amount);
    }

    const expensesByCategory = Array.from(catMap.entries()).map(([category, amountPoisha]) => ({
      category,
      amountPoisha,
    }));

    const netProfitPoisha = grossProfitPoisha - totalExpensesPoisha;
    const netMarginPct =
      grossRevenuePoisha > 0
        ? Number(((netProfitPoisha / grossRevenuePoisha) * 100).toFixed(2))
        : 0;

    const report: ExpensesVsRevenueReport = {
      periodStart: startDate,
      periodEnd: endDate,
      grossRevenuePoisha,
      costOfGoodsSoldPoisha,
      grossProfitPoisha,
      grossMarginPct,
      totalExpensesPoisha,
      expensesByCategory,
      netProfitPoisha,
      netMarginPct,
    };

    // CSV export
    if (searchParams.get("export") === "csv") {
      await assertFeatureEnabled(supabase, tenantId, "exportReports");
      const summaryRows = [
        { item: "Gross Sales Revenue", amount: (grossRevenuePoisha / 100).toFixed(2) },
        { item: "Cost of Goods Sold (COGS)", amount: (costOfGoodsSoldPoisha / 100).toFixed(2) },
        { item: "Gross Profit", amount: (grossProfitPoisha / 100).toFixed(2) },
        { item: "Gross Margin %", amount: `${grossMarginPct}%` },
        { item: "Total Operating Expenses", amount: (totalExpensesPoisha / 100).toFixed(2) },
        ...expensesByCategory.map((c) => ({
          item: `  - Expense: ${c.category}`,
          amount: (c.amountPoisha / 100).toFixed(2),
        })),
        { item: "Net Profit / (Loss)", amount: (netProfitPoisha / 100).toFixed(2) },
        { item: "Net Margin %", amount: `${netMarginPct}%` },
      ];

      const csv = generateCsv<{ item: string; amount: string }>(
        [
          { header: "Financial Line Item", accessor: (r) => r.item },
          { header: "Amount (BDT)", accessor: (r) => r.amount },
        ],
        summaryRows
      );

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="expenses-vs-revenue-${startDate}-to-${endDate}.csv"`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
