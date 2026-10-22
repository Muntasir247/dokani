"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  X,
  CheckCircle2,
} from "lucide-react";
import { PlanTier } from "@/types/database.types";

interface TenantAdminRecord {
  id: string;
  name: string;
  slug: string;
  currency: string;
  created_at: string;
  subscriptions: Array<{
    id: string;
    plan_tier: PlanTier;
    status: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
    max_stores: number;
    max_products: number;
    max_staff: number;
  }>;
}

export default function AdminDashboardPage() {
  const [tenants, setTenants] = useState<TenantAdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");

  // Extend Trial Modal State
  const [extendTenant, setExtendTenant] = useState<TenantAdminRecord | null>(null);
  const [extendDays, setExtendDays] = useState(14);
  const [extending, setExtending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Change Plan Modal State
  const [changePlanTenant, setChangePlanTenant] = useState<TenantAdminRecord | null>(null);
  const [targetPlan, setTargetPlan] = useState<PlanTier>("pro");
  const [targetStatus, setTargetStatus] = useState("active");
  const [savingPlan, setSavingPlan] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tenants");
      const data = await res.json();
      if (res.ok && data?.tenants) {
        setTenants(data.tenants);
      }
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const handleExtendTrial = async () => {
    if (!extendTenant) return;
    setExtending(true);
    setActionError(null);

    try {
      const res = await fetch("/api/admin/extend-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: extendTenant.id,
          days: extendDays,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to extend trial");
      }

      setActionSuccess(`Trial for ${extendTenant.name} extended by +${extendDays} days.`);
      setExtendTenant(null);
      fetchTenants();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Error extending trial");
    } finally {
      setExtending(false);
    }
  };

  const handleSetPlan = async () => {
    if (!changePlanTenant) return;
    setSavingPlan(true);
    setActionError(null);

    try {
      const res = await fetch("/api/admin/set-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: changePlanTenant.id,
          planTier: targetPlan,
          status: targetStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to override plan");
      }

      setActionSuccess(`Plan for ${changePlanTenant.name} updated to ${targetPlan.toUpperCase()}.`);
      setChangePlanTenant(null);
      fetchTenants();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Error setting plan");
    } finally {
      setSavingPlan(false);
    }
  };

  const filteredTenants = tenants.filter((t) => {
    const sub = t.subscriptions?.[0];
    if (planFilter !== "all" && sub?.plan_tier !== planFilter) return false;
    if (search.trim() && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.slug.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Platform Tenants & Billing</h1>
          <p className="text-sm text-slate-400">
            Super admin controls to view tenant subscriptions, usage limits, and manage trial extensions
          </p>
        </div>
      </div>

      {actionSuccess && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs font-semibold text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenant name or slug..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 pl-10 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-red-500 focus:ring-1 focus:ring-red-500"
          />
        </div>

        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 focus:border-red-500 focus:ring-1 focus:ring-red-500"
        >
          <option value="all">All Plans</option>
          <option value="free">Free Starter</option>
          <option value="pro">Pro Merchant</option>
          <option value="business">Business Enterprise</option>
        </select>
      </div>

      {/* Tenants Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase text-[11px]">
                <th className="py-3.5 px-6">Tenant Name</th>
                <th className="py-3.5 px-4">Plan Tier</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Trial / Period End</th>
                <th className="py-3.5 px-4 text-right">Limits (Stores / Staff / Prods)</th>
                <th className="py-3.5 px-6 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading platform tenants...
                  </td>
                </tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No tenants found matching search.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => {
                  const sub = t.subscriptions?.[0];
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/50 transition">
                      <td className="py-4 px-6">
                        <div className="font-bold text-white text-sm">{t.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{t.slug}</div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            sub?.plan_tier === "business"
                              ? "bg-purple-950 text-purple-400 border border-purple-800/50"
                              : sub?.plan_tier === "pro"
                              ? "bg-blue-950 text-blue-400 border border-blue-800/50"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {sub?.plan_tier || "free"}
                        </span>
                      </td>

                      <td className="py-4 px-4 capitalize font-semibold text-slate-300">
                        {sub?.status || "active"}
                      </td>

                      <td className="py-4 px-4 text-slate-400">
                        {sub?.trial_ends_at
                          ? new Date(sub.trial_ends_at).toLocaleDateString("en-GB")
                          : sub?.current_period_end
                          ? new Date(sub.current_period_end).toLocaleDateString("en-GB")
                          : "—"}
                      </td>

                      <td className="py-4 px-4 text-right font-mono text-slate-300">
                        {sub?.max_stores || 1} / {sub?.max_staff || 2} / {sub?.max_products || 200}
                      </td>

                      <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setExtendTenant(t)}
                          className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                        >
                          Extend Trial
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setChangePlanTenant(t);
                            setTargetPlan(sub?.plan_tier || "pro");
                            setTargetStatus(sub?.status || "active");
                          }}
                          className="rounded-lg bg-red-950/80 border border-red-800/60 px-2.5 py-1.5 text-[11px] font-bold text-red-300 hover:bg-red-900 transition"
                        >
                          Override Plan
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Extend Trial Modal */}
      {extendTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-base font-bold text-white">Extend Trial Period</h3>
                <p className="text-xs text-slate-400">Tenant: {extendTenant.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setExtendTenant(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {actionError && (
              <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300 mb-4">
                {actionError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Select Days to Add
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setExtendDays(d)}
                      className={`rounded-xl border py-2.5 text-xs font-bold transition ${
                        extendDays === d
                          ? "border-red-500 bg-red-950/80 text-red-300 shadow"
                          : "border-slate-800 bg-slate-800/60 text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      +{d} Days
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setExtendTenant(null)}
                  disabled={extending}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExtendTrial}
                  disabled={extending}
                  className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-red-500 disabled:opacity-50"
                >
                  {extending ? "Extending..." : `Grant +${extendDays} Days`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Override Plan Modal */}
      {changePlanTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-base font-bold text-white">Override Tenant Plan</h3>
                <p className="text-xs text-slate-400">Tenant: {changePlanTenant.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setChangePlanTenant(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {actionError && (
              <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300 mb-4">
                {actionError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Plan Tier
                </label>
                <select
                  value={targetPlan}
                  onChange={(e) => setTargetPlan(e.target.value as PlanTier)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-800 px-3.5 py-2.5 text-xs text-slate-200"
                >
                  <option value="free">Free Starter</option>
                  <option value="pro">Pro Merchant</option>
                  <option value="business">Business Enterprise</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Subscription Status
                </label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-800 px-3.5 py-2.5 text-xs text-slate-200"
                >
                  <option value="trialing">Trialing</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setChangePlanTenant(null)}
                  disabled={savingPlan}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSetPlan}
                  disabled={savingPlan}
                  className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-red-500 disabled:opacity-50"
                >
                  {savingPlan ? "Saving..." : "Save Override"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
