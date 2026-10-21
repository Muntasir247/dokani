"use client";

import React from "react";
import { useTenant } from "@/context/tenant-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PermissionGuard } from "@/components/ui/permission-guard";
import Link from "next/link";
import { ShoppingCart, Package, Users, ShieldCheck, ArrowRight, TrendingUp } from "lucide-react";

export default function DashboardPage() {
  const { activeTenant, currentRole } = useTenant();

  if (!activeTenant) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        Loading store details...
      </div>
    );
  }

  const roleVariant =
    currentRole === "owner" ? "success" : currentRole === "manager" ? "info" : "default";

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {activeTenant.name}
            </h1>
            <Badge variant={roleVariant}>{currentRole}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500 font-mono">
            dokani.app/{activeTenant.slug} • Currency: {activeTenant.currency} (৳) • {activeTenant.timezone}
          </p>
        </div>

        <Link
          href="/pos"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
        >
          <ShoppingCart className="h-4 w-4" />
          <span>Launch POS Terminal</span>
        </Link>
      </div>

      {/* Quick Access Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-emerald-600" />
              <span>Fast POS Checkout</span>
            </CardTitle>
            <CardDescription>
              Barcode scanner and touch-ready cashier point-of-sale terminal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/pos"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              <span>Open Terminal</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              <span>Products & Stock</span>
            </CardTitle>
            <CardDescription>
              Manage variants, barcodes, pricing, and view ledger stock balances.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/catalog"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              <span>View Catalog</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        {/* Manager/Owner Exclusive Card: Reports */}
        <PermissionGuard
          action="view:reports"
          fallback={
            <Card className="border-dashed bg-slate-50/50">
              <CardHeader>
                <CardTitle className="text-slate-400 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  <span>Financial Reports</span>
                </CardTitle>
                <CardDescription>
                  Restricted to Store Managers and Owners.
                </CardDescription>
              </CardHeader>
            </Card>
          }
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-indigo-600" />
                <span>Sales & Financials</span>
              </CardTitle>
              <CardDescription>
                Live revenue, cashier shift totals, dues collection, and profit/loss.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/reports"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                <span>View Reports</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        </PermissionGuard>
      </div>

      {/* Staff & Tenant Section (Owners & Managers only) */}
      <PermissionGuard action="manage:members">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Staff Members & Permissions</h3>
                <p className="text-xs text-slate-500">
                  Invite cashiers or managers, update roles, and manage invitations.
                </p>
              </div>
            </div>
            <Link
              href="/settings/members"
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Manage Team
            </Link>
          </div>
        </div>
      </PermissionGuard>
    </div>
  );
}
