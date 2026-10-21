"use client";

import React, { useEffect, useState } from "react";
import { useTenant } from "@/context/tenant-context";
import { can } from "@/lib/auth/permissions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatBDT } from "@/lib/money";
import { ShieldAlert, TrendingUp, DollarSign, CreditCard } from "lucide-react";

interface SalesSummary {
  totalSalesCount: number;
  totalRevenuePoisha: number;
  totalPaidPoisha: number;
  totalDuePoisha: number;
}

export default function ReportsPage() {
  const { activeTenant, currentRole } = useTenant();
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasAccess = can(currentRole, "view:reports");

  useEffect(() => {
    if (!activeTenant || !hasAccess) return;

    const fetchSummary = async () => {
      try {
        const res = await fetch(`/api/reports/sales-summary?tenantId=${activeTenant.id}`);
        if (!res.ok) {
          const json = await res.json();
          setErrorMsg(json.error || "Failed to load sales summary");
          return;
        }
        const json = await res.json();
        setSummary(json.summary);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Network error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummary();
  }, [activeTenant, hasAccess]);

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-rose-100 p-3 text-rose-600 mb-3">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Access Denied</h2>
        <p className="mt-1 text-sm text-slate-500 max-w-sm">
          Cashier accounts are restricted from accessing store financial summaries and reports.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sales Reports & Analytics</h1>
        <p className="text-sm text-slate-500">
          Financial performance for {activeTenant?.name} (Authorized as <span className="font-semibold uppercase">{currentRole}</span>)
        </p>
      </div>

      {errorMsg ? (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700">
          {errorMsg}
        </div>
      ) : isLoading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading financial reports...</div>
      ) : summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Revenue
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {formatBDT(summary.totalRevenuePoisha)}
              </div>
              <p className="mt-1 text-xs text-slate-500 font-mono">
                {summary.totalSalesCount} completed invoices
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Amount Collected
              </CardTitle>
              <DollarSign className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700">
                {formatBDT(summary.totalPaidPoisha)}
              </div>
              <p className="mt-1 text-xs text-slate-500">Cash, bKash & Card settlements</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Customer Dues (Khata)
              </CardTitle>
              <CreditCard className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-700">
                {formatBDT(summary.totalDuePoisha)}
              </div>
              <p className="mt-1 text-xs text-slate-500">Receivables owed by customers</p>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
