"use client";

import React, { useEffect, useState } from "react";
import { useTenant } from "@/context/tenant-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBDT } from "@/lib/money";
import { can } from "@/lib/auth/permissions";
import { DashboardAnalyticsResponse } from "@/features/reports/types";
import Link from "next/link";
import {
  ShoppingCart,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Boxes,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

export default function DashboardPage() {
  const { activeTenant, currentRole } = useTenant();
  const [data, setData] = useState<DashboardAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hoveredHour, setHoveredHour] = useState<{ hour: number; revenue: number; invoices: number } | null>(null);

  const canViewFinancials = can(currentRole, "view:reports") && can(currentRole, "view:cost_price");

  const fetchAnalytics = React.useCallback(async () => {
    if (!activeTenant) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/analytics/dashboard?tenantId=${activeTenant.id}`);
      if (!res.ok) {
        const json = await res.json();
        setErrorMsg(json.error || "Failed to load dashboard metrics");
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }, [activeTenant]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (!activeTenant) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
        Loading store session...
      </div>
    );
  }

  const roleVariant =
    currentRole === "owner" ? "success" : currentRole === "manager" ? "info" : "default";

  // Calculate maximum hourly revenue for SVG bar chart scaling
  const maxHourlyRevenue = Math.max(
    1,
    ...(data?.hourlySales?.map((h) => h.revenuePoisha) || [1])
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {activeTenant.name}
            </h1>
            <Badge variant={roleVariant}>{currentRole}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500 font-mono">
            Outlet: dokani.app/{activeTenant.slug} • Currency: {activeTenant.currency} (৳) • Timezone: {activeTenant.timezone}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAnalytics}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
            title="Refresh Live Data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <Link
            href="/pos"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            <ShoppingCart className="h-4 w-4" />
            <span>Launch POS Terminal</span>
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700">
          {errorMsg}
        </div>
      )}

      {/* Primary KPI Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales Revenue */}
        <Card className="border-slate-200 shadow-sm hover:shadow transition">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Today&apos;s Revenue
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">
              {formatBDT(data?.today.revenuePoisha || 0)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {/* Yesterday Comparison Badge */}
              <span
                className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold text-[11px] ${
                  (data?.comparison.diffYesterdayPoisha || 0) >= 0
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {(data?.comparison.diffYesterdayPoisha || 0) >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {Math.abs(data?.comparison.pctChangeYesterday || 0)}% vs yesterday
              </span>

              <span className="text-slate-400 font-mono text-[11px]">
                {data?.today.invoices || 0} invoices
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Gross Profit (Cashiers cannot see this) */}
        {canViewFinancials ? (
          <Card className="border-slate-200 shadow-sm hover:shadow transition">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Gross Profit
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-blue-700">
                {formatBDT(data?.today.grossProfitPoisha || 0)}
              </div>
              <p className="mt-2 text-xs text-slate-500 font-medium">
                Margin: <strong className="text-blue-900">{data?.today.grossMarginPercentage || 0}%</strong> (COGS: {formatBDT(data?.today.costPoisha || 0)})
              </p>
            </CardContent>
          </Card>
        ) : (
          /* Cashier View: Average Basket Size */
          <Card className="border-slate-200 shadow-sm hover:shadow transition">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Average Basket Size
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                <ShoppingCart className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-purple-700">
                {formatBDT(data?.today.averageBasketPoisha || 0)}
              </div>
              <p className="mt-2 text-xs text-slate-500">Per checkout transaction</p>
            </CardContent>
          </Card>
        )}

        {/* Low Stock Alerts */}
        <Card className="border-slate-200 shadow-sm hover:shadow transition">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Low Stock Warnings
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-black ${(data?.lowStockCount || 0) > 0 ? "text-amber-600" : "text-slate-900"}`}>
                {data?.lowStockCount || 0}
              </span>
              <span className="text-xs text-slate-500">items below reorder level</span>
            </div>
            <div className="mt-2">
              <Link
                href="/inventory"
                className="text-xs font-semibold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1"
              >
                <span>View stock reorder list</span>
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Dues (Customer Khata) */}
        <Card className="border-slate-200 shadow-sm hover:shadow transition">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Pending Dues (Khata)
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <CreditCard className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-rose-700">
              {formatBDT(data?.dues.totalDuePoisha || 0)}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Owed by <strong>{data?.dues.pendingCustomers || 0}</strong> customers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Hourly Sales Chart (0 to 23 Hours) */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-600" />
              <span>Sales Distribution by Hour</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Hourly order volume and revenue generation across today (00:00 to 23:00)
            </CardDescription>
          </div>
          {hoveredHour && (
            <div className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white shadow font-mono">
              {hoveredHour.hour.toString().padStart(2, "0")}:00 • {formatBDT(hoveredHour.revenue)} ({hoveredHour.invoices} sales)
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="pt-2">
            {/* SVG / CSS Hourly Bars */}
            <div className="flex items-end gap-1.5 h-44 w-full border-b border-slate-200 pb-2 px-1">
              {(data?.hourlySales || Array.from({ length: 24 }, (_, i) => ({ hour: i, revenuePoisha: 0, invoices: 0 }))).map(
                (h) => {
                  const heightPct = Math.max(
                    4,
                    Math.round((h.revenuePoisha / maxHourlyRevenue) * 100)
                  );
                  const isZero = h.revenuePoisha === 0;

                  return (
                    <div
                      key={h.hour}
                      className="group relative flex-1 flex flex-col items-center justify-end h-full cursor-pointer"
                      onMouseEnter={() =>
                        setHoveredHour({ hour: h.hour, revenue: h.revenuePoisha, invoices: h.invoices })
                      }
                      onMouseLeave={() => setHoveredHour(null)}
                    >
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full rounded-t transition-all duration-200 ${
                          isZero
                            ? "bg-slate-100 group-hover:bg-slate-200"
                            : "bg-emerald-500 group-hover:bg-emerald-600 shadow-xs"
                        }`}
                      />
                    </div>
                  );
                }
              )}
            </div>

            {/* Hour Axis Labels (Every 3 hours) */}
            <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-2 px-1">
              <span>00:00</span>
              <span>03:00</span>
              <span>06:00</span>
              <span>09:00</span>
              <span>12:00</span>
              <span>15:00</span>
              <span>18:00</span>
              <span>21:00</span>
              <span>23:00</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lower Section: Top Products & Quick Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Top 5 Best Sellers Today */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Today&apos;s Best Selling Items</h3>
              <p className="text-xs text-slate-500">Ranked by revenue contribution today</p>
            </div>
            <Link
              href="/reports"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Full reports →
            </Link>
          </div>

          {(data?.topProducts || []).length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No product sales recorded yet today.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="pb-2.5">Product</th>
                    <th className="pb-2.5">SKU</th>
                    <th className="pb-2.5 text-center">Units Sold</th>
                    <th className="pb-2.5 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.topProducts.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 font-medium text-slate-900">
                        {p.product_name}
                      </td>
                      <td className="py-2.5 font-mono text-slate-500">{p.sku}</td>
                      <td className="py-2.5 text-center font-bold text-slate-800">
                        {p.quantity_sold}
                      </td>
                      <td className="py-2.5 text-right font-bold text-emerald-700 font-mono">
                        {formatBDT(p.revenue_poisha)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Operations Sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Comparison Overview</h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Yesterday Revenue:</span>
                <span className="font-bold font-mono text-slate-800">
                  {formatBDT(data?.comparison.yesterdayRevenuePoisha || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Last Week Same Day:</span>
                <span className="font-bold font-mono text-slate-800">
                  {formatBDT(data?.comparison.lastWeekRevenuePoisha || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Week-over-Week Diff:</span>
                <span
                  className={`font-bold font-mono ${
                    (data?.comparison.diffLastWeekPoisha || 0) >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  }`}
                >
                  {(data?.comparison.diffLastWeekPoisha || 0) >= 0 ? "+" : ""}
                  {formatBDT(data?.comparison.diffLastWeekPoisha || 0)} ({data?.comparison.pctChangeLastWeek || 0}%)
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-900 mb-1">
              <Boxes className="h-4 w-4 text-slate-700" />
              <span>Shift Register Tip</span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              Open a shift drawer float at shift beginning to ensure cashier reconciliation and prevent cash variance disputes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
