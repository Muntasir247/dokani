"use client";

import React, { useState, useEffect } from "react";
import { useTenant } from "@/context/tenant-context";
import { can } from "@/lib/auth/permissions";
import { formatBDT } from "@/lib/money";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ShieldAlert,
  Download,
  Printer,
  Calendar,
  TrendingUp,
  Boxes,
  Clock,
  AlertTriangle,
  CreditCard,
  DollarSign,
  FileText,
  RefreshCw,
} from "lucide-react";

type ReportTab =
  | "profit_margin"
  | "valuation"
  | "dead_stock"
  | "customer_aging"
  | "shifts"
  | "expenses_revenue"
  | "tax_summary"
  | "movements";

export default function ReportsPage() {
  const { activeTenant, currentRole } = useTenant();
  const [activeTab, setActiveTab] = useState<ReportTab>("profit_margin");

  // Filters
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [groupBy, setGroupBy] = useState<string>("product");
  const [deadStockDays, setDeadStockDays] = useState<number>(30);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Report Data States
  const [profitData, setProfitData] = useState<any>(null);
  const [valuationData, setValuationData] = useState<any>(null);
  const [deadStockData, setDeadStockData] = useState<any>(null);
  const [agingData, setAgingData] = useState<any>(null);
  const [shiftsData, setShiftsData] = useState<any>(null);
  const [pnlData, setPnlData] = useState<any>(null);
  const [taxData, setTaxData] = useState<any>(null);
  const [movementsData, setMovementsData] = useState<any>(null);

  const hasAccess = can(currentRole, "view:reports");
  const canViewCosts = can(currentRole, "view:cost_price");

  // Load active tab data
  const loadTabData = React.useCallback(async () => {
    if (!activeTenant || !hasAccess) return;
    setIsLoading(true);
    setErrorMsg(null);

    const tenantId = activeTenant.id;
    try {
      if (activeTab === "profit_margin") {
        const res = await fetch(
          `/api/reports/profit-margin?tenantId=${tenantId}&groupBy=${groupBy}&startDate=${startDate}&endDate=${endDate}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setProfitData(json);
      } else if (activeTab === "valuation") {
        const res = await fetch(`/api/reports/valuation?tenantId=${tenantId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setValuationData(json);
      } else if (activeTab === "dead_stock") {
        const res = await fetch(
          `/api/reports/dead-stock?tenantId=${tenantId}&days=${deadStockDays}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setDeadStockData(json);
      } else if (activeTab === "customer_aging") {
        const res = await fetch(`/api/reports/aging?tenantId=${tenantId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setAgingData(json);
      } else if (activeTab === "shifts") {
        const res = await fetch(`/api/reports/shifts?tenantId=${tenantId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setShiftsData(json);
      } else if (activeTab === "expenses_revenue") {
        const res = await fetch(
          `/api/reports/expenses-revenue?tenantId=${tenantId}&startDate=${startDate}&endDate=${endDate}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setPnlData(json);
      } else if (activeTab === "tax_summary") {
        const res = await fetch(
          `/api/reports/tax-summary?tenantId=${tenantId}&startDate=${startDate}&endDate=${endDate}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setTaxData(json);
      } else if (activeTab === "movements") {
        const res = await fetch(
          `/api/reports/stock-movements?tenantId=${tenantId}&startDate=${startDate}&endDate=${endDate}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setMovementsData(json);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load report data");
    } finally {
      setIsLoading(false);
    }
  }, [activeTenant, hasAccess, activeTab, groupBy, deadStockDays, startDate, endDate]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  const handleExportCsv = () => {
    if (!activeTenant) return;
    let url = "";
    if (activeTab === "profit_margin") {
      url = `/api/reports/profit-margin?tenantId=${activeTenant.id}&groupBy=${groupBy}&startDate=${startDate}&endDate=${endDate}&export=csv`;
    } else if (activeTab === "valuation") {
      url = `/api/reports/valuation?tenantId=${activeTenant.id}&export=csv`;
    } else if (activeTab === "dead_stock") {
      url = `/api/reports/dead-stock?tenantId=${activeTenant.id}&days=${deadStockDays}&export=csv`;
    } else if (activeTab === "customer_aging") {
      url = `/api/reports/aging?tenantId=${activeTenant.id}&export=csv`;
    } else if (activeTab === "shifts") {
      url = `/api/reports/shifts?tenantId=${activeTenant.id}&export=csv`;
    } else if (activeTab === "expenses_revenue") {
      url = `/api/reports/expenses-revenue?tenantId=${activeTenant.id}&startDate=${startDate}&endDate=${endDate}&export=csv`;
    } else if (activeTab === "tax_summary") {
      url = `/api/reports/tax-summary?tenantId=${activeTenant.id}&startDate=${startDate}&endDate=${endDate}&export=csv`;
    } else if (activeTab === "movements") {
      url = `/api/reports/stock-movements?tenantId=${activeTenant.id}&startDate=${startDate}&endDate=${endDate}&export=csv`;
    }

    if (url) {
      window.open(url, "_blank");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="rounded-full bg-rose-100 p-3 text-rose-600 mb-3">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="mt-1 text-sm text-slate-500 max-w-sm">
          Store cashiers cannot access proprietary financial reports or profit margins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-white p-6 border border-slate-200 shadow-sm print:hidden">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Reports & Business Intelligence
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Store: {activeTenant?.name} • Authorized as <span className="uppercase font-bold text-slate-700">{currentRole}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
          >
            <Download className="h-4 w-4 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition shadow-xs"
          >
            <Printer className="h-4 w-4 text-slate-300" />
            <span>Print / PDF</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex overflow-x-auto gap-2 border-b border-slate-200 pb-2 print:hidden">
        {[
          { id: "profit_margin", label: "Profit & Margins", icon: TrendingUp },
          { id: "valuation", label: "Inventory Valuation", icon: Boxes },
          { id: "dead_stock", label: "Dead Stock", icon: AlertTriangle },
          { id: "customer_aging", label: "Customer Aging", icon: CreditCard },
          { id: "shifts", label: "Cash Drawer Shifts", icon: Clock },
          { id: "expenses_revenue", label: "Expenses vs Revenue", icon: DollarSign },
          { id: "tax_summary", label: "Tax / VAT Summary", icon: FileText },
          { id: "movements", label: "Stock Movements", icon: Boxes },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as ReportTab)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                isActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter Control Bar (Date Range, Group By, Dead Stock Days) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Date range picker for time-based reports */}
          {(activeTab === "profit_margin" ||
            activeTab === "expenses_revenue" ||
            activeTab === "tax_summary" ||
            activeTab === "movements") && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-mono font-medium focus:border-emerald-500 focus:outline-none"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-mono font-medium focus:border-emerald-500 focus:outline-none"
              />
            </div>
          )}

          {/* Group By selector for Profit & Margins */}
          {activeTab === "profit_margin" && (
            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
              <span className="text-slate-500 font-semibold">Group By:</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold focus:border-emerald-500 focus:outline-none"
              >
                <option value="product">By Product & SKU</option>
                <option value="category">By Category</option>
                <option value="brand">By Brand</option>
                <option value="cashier">By Cashier</option>
              </select>
            </div>
          )}

          {/* Days threshold selector for Dead Stock */}
          {activeTab === "dead_stock" && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-semibold">Unsold Threshold:</span>
              <select
                value={deadStockDays}
                onChange={(e) => setDeadStockDays(Number(e.target.value))}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold focus:border-emerald-500 focus:outline-none"
              >
                <option value="15">No sales in 15+ Days</option>
                <option value="30">No sales in 30+ Days</option>
                <option value="60">No sales in 60+ Days</option>
                <option value="90">No sales in 90+ Days</option>
              </select>
            </div>
          )}
        </div>

        <button
          onClick={loadTabData}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700">
          {errorMsg}
        </div>
      )}

      {/* REPORT CONTENT BODY */}
      <div className="space-y-6">
        {/* 1. PROFIT & MARGIN REPORT */}
        {activeTab === "profit_margin" && (
          <div className="space-y-4">
            {profitData?.summary && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Gross Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-slate-900">
                      {formatBDT(profitData.summary.totalRevenuePoisha)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Cost of Goods</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-slate-700">
                      {formatBDT(profitData.summary.totalCostPoisha)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Gross Profit</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-emerald-700">
                      {formatBDT(profitData.summary.totalGrossProfitPoisha)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Overall Margin</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-blue-700">
                      {profitData.summary.overallMargin}%
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="py-3 px-4">{groupBy.toUpperCase()}</th>
                    <th className="py-3 px-4 text-center">Qty Sold</th>
                    <th className="py-3 px-4 text-right">Revenue</th>
                    {canViewCosts && <th className="py-3 px-4 text-right">COGS (Unit Cost)</th>}
                    {canViewCosts && <th className="py-3 px-4 text-right">Gross Profit</th>}
                    {canViewCosts && <th className="py-3 px-4 text-right">Margin %</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(profitData?.items || []).map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-900">{row.name}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-700">{row.quantitySold}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{formatBDT(row.revenuePoisha)}</td>
                      {canViewCosts && <td className="py-3 px-4 text-right font-mono text-slate-600">{formatBDT(row.costPoisha)}</td>}
                      {canViewCosts && <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">{formatBDT(row.grossProfitPoisha)}</td>}
                      {canViewCosts && <td className="py-3 px-4 text-right font-bold text-blue-700">{row.marginPercentage}%</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. INVENTORY VALUATION */}
        {activeTab === "valuation" && (
          <div className="space-y-4">
            {valuationData?.summary && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Total Cost Value</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-slate-900">
                      {formatBDT(valuationData.summary.totalCostPoisha)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Total Retail Value</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-blue-700">
                      {formatBDT(valuationData.summary.totalRetailPoisha)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Potential Profit</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-emerald-700">
                      {formatBDT(valuationData.summary.totalPotentialProfitPoisha)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Overall Margin</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-purple-700">
                      {valuationData.summary.overallMargin}%
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4 text-center">Stock</th>
                    <th className="py-3 px-4 text-right">Unit Cost</th>
                    <th className="py-3 px-4 text-right">Unit Retail</th>
                    <th className="py-3 px-4 text-right">Total Cost Value</th>
                    <th className="py-3 px-4 text-right">Total Retail Value</th>
                    <th className="py-3 px-4 text-right">Potential Profit</th>
                    <th className="py-3 px-4 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(valuationData?.items || []).map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-900">{row.productName}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{row.sku}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800">{row.currentStock}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">{formatBDT(row.unitCostPoisha)}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">{formatBDT(row.unitRetailPoisha)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{formatBDT(row.totalCostValuePoisha)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">{formatBDT(row.totalRetailValuePoisha)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">{formatBDT(row.potentialProfitPoisha)}</td>
                      <td className="py-3 px-4 text-right font-bold text-purple-700">{row.marginPercentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. DEAD STOCK */}
        {activeTab === "dead_stock" && (
          <div className="space-y-4">
            {deadStockData?.summary && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Dead Stock Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-amber-700">
                      {deadStockData.summary.deadStockCount} variants
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Unsold Quantity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-slate-800">
                      {deadStockData.summary.totalUnsoldUnits} units
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Trapped Capital Value</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-rose-700">
                      {formatBDT(deadStockData.summary.totalTrappedCapitalPoisha)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Unsold Units</th>
                    <th className="py-3 px-4 text-right">Unit Cost</th>
                    <th className="py-3 px-4 text-right">Trapped Capital</th>
                    <th className="py-3 px-4 text-center">Last Sold</th>
                    <th className="py-3 px-4 text-center">Days Inactive</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(deadStockData?.items || []).map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-900">{row.productName}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{row.sku}</td>
                      <td className="py-3 px-4 text-slate-600">{row.categoryName}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800">{row.currentStock}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">{formatBDT(row.unitCostPoisha)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">{formatBDT(row.deadStockValuePoisha)}</td>
                      <td className="py-3 px-4 text-center text-slate-500 font-mono">{row.lastSoldAt ? new Date(row.lastSoldAt).toLocaleDateString() : "Never"}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                          {row.daysWithoutSales >= 9999 ? "Never Sold" : `${row.daysWithoutSales}d`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. CUSTOMER AGING */}
        {activeTab === "customer_aging" && (
          <div className="space-y-4">
            {agingData?.agingBuckets && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">0 - 30 Days (Current)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-emerald-700">
                      {formatBDT(agingData.agingBuckets.current0To30Poisha)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">31 - 60 Days</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-amber-600">
                      {formatBDT(agingData.agingBuckets.days31To60Poisha)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">61 - 90 Days</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-orange-600">
                      {formatBDT(agingData.agingBuckets.days61To90Poisha)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">90+ Days (Overdue)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-rose-700">
                      {formatBDT(agingData.agingBuckets.days90PlusPoisha)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4 text-right">Total Owed</th>
                    <th className="py-3 px-4 text-right">0-30 Days</th>
                    <th className="py-3 px-4 text-right">31-60 Days</th>
                    <th className="py-3 px-4 text-right">61-90 Days</th>
                    <th className="py-3 px-4 text-right">90+ Days (Overdue)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(agingData?.topDebtors || []).map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-900">{row.customerName}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{row.phone || "—"}</td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{formatBDT(row.totalBalancePoisha)}</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-700">{formatBDT(row.bucket0To30)}</td>
                      <td className="py-3 px-4 text-right font-mono text-amber-700">{formatBDT(row.bucket31To60)}</td>
                      <td className="py-3 px-4 text-right font-mono text-orange-700">{formatBDT(row.bucket61To90)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">{formatBDT(row.bucket90Plus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. CASH DRAWER SHIFTS */}
        {activeTab === "shifts" && (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">Opened At</th>
                  <th className="py-3 px-4">Closed At</th>
                  <th className="py-3 px-4">Cashier</th>
                  <th className="py-3 px-4 text-right">Opening Float</th>
                  <th className="py-3 px-4 text-right">Expected Cash</th>
                  <th className="py-3 px-4 text-right">Counted Cash</th>
                  <th className="py-3 px-4 text-right">Variance</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(shiftsData?.shifts || []).map((row: any) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-mono text-slate-600">{new Date(row.openedAt).toLocaleString()}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{row.closedAt ? new Date(row.closedAt).toLocaleString() : "Still Open"}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{row.cashierName}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">{formatBDT(row.openingFloatPoisha)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{row.expectedCashPoisha !== null ? formatBDT(row.expectedCashPoisha) : "—"}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{row.closingCountedPoisha !== null ? formatBDT(row.closingCountedPoisha) : "—"}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {row.cashVariancePoisha !== null ? (
                        <span className={row.cashVariancePoisha === 0 ? "text-emerald-600" : row.cashVariancePoisha < 0 ? "text-rose-600" : "text-blue-600"}>
                          {row.cashVariancePoisha < 0 ? "-" : "+"}{formatBDT(Math.abs(row.cashVariancePoisha))}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`rounded-md px-2 py-0.5 font-bold uppercase text-[10px] ${row.status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 6. EXPENSES VS REVENUE */}
        {activeTab === "expenses_revenue" && (
          <div className="space-y-4">
            {pnlData && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Gross Sales Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-slate-900">{formatBDT(pnlData.grossRevenuePoisha)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Operating Expenses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-amber-700">{formatBDT(pnlData.totalExpensesPoisha)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Net Profit / (Loss)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-xl font-black ${pnlData.netProfitPoisha >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {formatBDT(pnlData.netProfitPoisha)} ({pnlData.netMarginPct}%)
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Expenses Breakdown by Category</h3>
              <div className="divide-y divide-slate-100">
                {(pnlData?.expensesByCategory || []).map((c: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-2.5 text-xs">
                    <span className="font-medium text-slate-700">{c.category}</span>
                    <span className="font-mono font-bold text-slate-900">{formatBDT(c.amountPoisha)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 7. TAX / VAT SUMMARY */}
        {activeTab === "tax_summary" && (
          <div className="space-y-4">
            {taxData?.summary && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Store VAT/BIN</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-mono font-bold text-slate-900">{taxData.vatBinNumber}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Taxable Sales Base</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-slate-900">{formatBDT(taxData.summary.totalTaxablePoisha)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs uppercase text-slate-500">Total VAT Collected</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-black text-emerald-700">{formatBDT(taxData.summary.totalTaxPoisha)}</div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                    <th className="py-3 px-4 text-right">Discount</th>
                    <th className="py-3 px-4 text-right">Taxable Amount</th>
                    <th className="py-3 px-4 text-right">VAT Collected</th>
                    <th className="py-3 px-4 text-right">Invoice Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(taxData?.rows || []).map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">#{row.invoiceNumber}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{new Date(row.soldAt).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">{formatBDT(row.subtotalPoisha)}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">{formatBDT(row.discountPoisha)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{formatBDT(row.taxableAmountPoisha)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">{formatBDT(row.taxAmountPoisha)}</td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{formatBDT(row.totalAmountPoisha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 8. STOCK MOVEMENTS */}
        {activeTab === "movements" && (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4 text-center">Delta Qty</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                  <th className="py-3 px-4">Ref Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(movementsData?.movements || []).map((row: any) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-mono text-slate-600">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="py-3 px-4 font-bold uppercase text-[10px] text-slate-700">{row.type}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{row.productName}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{row.sku}</td>
                    <td className="py-3 px-4 text-center font-black">
                      <span className={row.quantity > 0 ? "text-emerald-700" : "text-rose-700"}>
                        {row.quantity > 0 ? `+${row.quantity}` : row.quantity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{row.reason || "—"}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{row.referenceType || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
