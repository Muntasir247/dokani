"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTenant } from "@/context/tenant-context";
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Download,
  Building,
  Users,
  Package,
  X,
  Lock,
} from "lucide-react";
import { formatPoisha } from "@/lib/receipts/templates";
import { PLANS, BillingInterval } from "@/lib/billing/plan-config";
import { PlanTier } from "@/types/database.types";

interface SubscriptionDetails {
  id: string;
  plan_tier: PlanTier;
  status: string;
  max_stores: number;
  max_staff: number;
  max_products: number;
  current_period_start: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  grace_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  lifecycle: {
    status: string;
    isReadOnly: boolean;
    inGracePeriod: boolean;
    daysRemaining: number;
    statusMessage: string;
    canUpgrade: boolean;
    canWrite: boolean;
  };
}

interface BillingUsage {
  stores: { current: number; max: number; percentage: number };
  staff: { current: number; max: number; percentage: number };
  products: { current: number; max: number; percentage: number };
}

interface SubscriptionInvoice {
  id: string;
  invoice_number: string;
  amount_poisha: number;
  plan_tier: string;
  billing_interval: string;
  status: string;
  payment_provider: string;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  created_at: string;
}

export default function BillingPage() {
  const { activeTenant } = useTenant();
  const [subDetails, setSubDetails] = useState<SubscriptionDetails | null>(null);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Upgrade Modal State
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>("pro");
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>("month");
  const [selectedProvider, setSelectedProvider] = useState<"sslcommerz" | "bkash">("sslcommerz");
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const fetchBillingData = useCallback(async () => {
    if (!activeTenant?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/billing/subscription?tenantId=${activeTenant.id}`);
      const data = await res.json();
      if (res.ok && data?.subscription) {
        setSubDetails(data.subscription);
        setUsage(data.usage);
        setInvoices(data.invoices || []);
      }
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [activeTenant?.id]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  const handleCheckout = async () => {
    if (!activeTenant?.id) return;
    setCheckingOut(true);
    setCheckoutError(null);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: activeTenant.id,
          planTier: selectedPlan,
          billingInterval: selectedInterval,
          provider: selectedProvider,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      if (data.gatewayUrl) {
        window.location.href = data.gatewayUrl;
      }
    } catch (err: unknown) {
      setCheckoutError(err instanceof Error ? err.message : "Error initiating payment");
      setCheckingOut(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm("Are you sure you want to cancel your paid plan? You will retain access until the end of your billing period, after which your account will become read-only. Your data will never be deleted.")) {
      return;
    }

    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: activeTenant?.id }),
      });
      if (res.ok) {
        alert("Subscription canceled. Access remains active until period end.");
        fetchBillingData();
      }
    } catch {
      alert("Failed to cancel subscription");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400 text-xs">Loading billing details...</div>;
  }

  const currentPlanConfig = subDetails ? PLANS[subDetails.plan_tier] : PLANS.free;
  const lifecycle = subDetails?.lifecycle;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Top Banner for Read-Only or Grace Period */}
      {lifecycle?.isReadOnly && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900 flex items-start gap-3 shadow-sm">
          <Lock className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold">Account in Read-Only Mode</h4>
            <p className="text-xs text-red-700 mt-1">{lifecycle.statusMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsUpgradeModalOpen(true)}
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 shadow"
          >
            Upgrade Now
          </button>
        </div>
      )}

      {lifecycle?.inGracePeriod && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold">Payment Grace Period Active ({lifecycle.daysRemaining} days left)</h4>
            <p className="text-xs text-amber-700 mt-1">{lifecycle.statusMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsUpgradeModalOpen(true)}
            className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 shadow"
          >
            Pay Now
          </button>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Subscription & Billing</h1>
            <p className="text-sm text-slate-500">
              Manage your Dokani plan, track resource limits, and download invoices
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsUpgradeModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition self-start sm:self-auto"
          >
            <Zap className="h-4 w-4" />
            Change / Upgrade Plan
          </button>
        </div>

        {/* Subnav Tabs */}
        <div className="flex items-center gap-2 mt-4">
          <Link
            href="/settings"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            Store & Invoices
          </Link>
          <Link
            href="/settings/members"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            Staff & Roles
          </Link>
          <Link
            href="/settings/billing"
            className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
          >
            Plan & Billing
          </Link>
        </div>
      </div>

      {/* Current Plan Overview Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Plan</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                  subDetails?.plan_tier === "business"
                    ? "bg-purple-100 text-purple-700"
                    : subDetails?.plan_tier === "pro"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {currentPlanConfig.name}
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 mt-1">
              ৳{currentPlanConfig.monthlyPriceBdt.toLocaleString()}
              <span className="text-xs font-normal text-slate-500"> / month</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">{currentPlanConfig.tagline}</p>
          </div>

          <div className="text-left sm:text-right text-xs text-slate-500 space-y-1">
            <div>
              Status: <strong className="text-slate-800 capitalize">{lifecycle?.status}</strong>
            </div>
            {subDetails?.current_period_end && (
              <div>
                Next Renewal: <strong>{new Date(subDetails.current_period_end).toLocaleDateString("en-GB")}</strong>
              </div>
            )}
            {subDetails?.cancel_at_period_end && (
              <div className="text-amber-600 font-semibold">Cancels at period end</div>
            )}
          </div>
        </div>

        {/* Resource Usage Meters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6">
          {/* Outlets */}
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
              <span className="flex items-center gap-1.5">
                <Building className="h-4 w-4 text-blue-600" />
                Branch Outlets
              </span>
              <span className="font-mono">
                {usage?.stores.current} / {usage?.stores.max}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  (usage?.stores.percentage || 0) >= 100 ? "bg-red-500" : "bg-blue-600"
                }`}
                style={{ width: `${usage?.stores.percentage || 0}%` }}
              ></div>
            </div>
          </div>

          {/* Staff */}
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-blue-600" />
                Staff Members
              </span>
              <span className="font-mono">
                {usage?.staff.current} / {usage?.staff.max}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  (usage?.staff.percentage || 0) >= 100 ? "bg-red-500" : "bg-blue-600"
                }`}
                style={{ width: `${usage?.staff.percentage || 0}%` }}
              ></div>
            </div>
          </div>

          {/* Products */}
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
              <span className="flex items-center gap-1.5">
                <Package className="h-4 w-4 text-blue-600" />
                Catalog Products
              </span>
              <span className="font-mono">
                {usage?.products.current} / {usage?.products.max}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  (usage?.products.percentage || 0) >= 100 ? "bg-red-500" : "bg-blue-600"
                }`}
                style={{ width: `${usage?.products.percentage || 0}%` }}
              ></div>
            </div>
          </div>
        </div>

        {subDetails?.plan_tier !== "free" && !subDetails?.cancel_at_period_end && (
          <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={handleCancelSubscription}
              className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
            >
              Cancel Subscription
            </button>
          </div>
        )}
      </div>

      {/* Feature Comparison Checklist */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-900">Included Features on {currentPlanConfig.name}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <CheckCircle2
              className={`h-4 w-4 ${currentPlanConfig.features.multiBranch ? "text-emerald-500" : "text-slate-300"}`}
            />
            <span className={currentPlanConfig.features.multiBranch ? "font-medium" : "text-slate-400 line-through"}>
              Multi-Branch Outlets
            </span>
          </div>

          <div className="flex items-center gap-2">
            <CheckCircle2
              className={`h-4 w-4 ${currentPlanConfig.features.serialTracking ? "text-emerald-500" : "text-slate-300"}`}
            />
            <span className={currentPlanConfig.features.serialTracking ? "font-medium" : "text-slate-400 line-through"}>
              Serial & Warranty Tracking
            </span>
          </div>

          <div className="flex items-center gap-2">
            <CheckCircle2
              className={`h-4 w-4 ${currentPlanConfig.features.exportReports ? "text-emerald-500" : "text-slate-300"}`}
            />
            <span className={currentPlanConfig.features.exportReports ? "font-medium" : "text-slate-400 line-through"}>
              Export Sales & Ledger CSV
            </span>
          </div>

          <div className="flex items-center gap-2">
            <CheckCircle2
              className={`h-4 w-4 ${currentPlanConfig.features.customBarcode ? "text-emerald-500" : "text-slate-300"}`}
            />
            <span className={currentPlanConfig.features.customBarcode ? "font-medium" : "text-slate-400 line-through"}>
              Custom Barcode Labels
            </span>
          </div>

          <div className="flex items-center gap-2">
            <CheckCircle2
              className={`h-4 w-4 ${currentPlanConfig.features.loyaltyRewards ? "text-emerald-500" : "text-slate-300"}`}
            />
            <span className={currentPlanConfig.features.loyaltyRewards ? "font-medium" : "text-slate-400 line-through"}>
              Customer Loyalty Program
            </span>
          </div>

          <div className="flex items-center gap-2">
            <CheckCircle2
              className={`h-4 w-4 ${currentPlanConfig.features.b2bWholesale ? "text-emerald-500" : "text-slate-300"}`}
            />
            <span className={currentPlanConfig.features.b2bWholesale ? "font-medium" : "text-slate-400 line-through"}>
              B2B Wholesale & Credit Tiers
            </span>
          </div>
        </div>
      </div>

      {/* Invoices History Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Subscription Payment Invoices</h3>
          <span className="text-xs text-slate-500">{invoices.length} invoices</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase text-[11px]">
                <th className="py-3 px-6">Invoice #</th>
                <th className="py-3 px-4">Period</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Provider</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No subscription invoices yet.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-6 font-mono font-bold text-slate-900">
                      {inv.invoice_number}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {new Date(inv.period_start).toLocaleDateString("en-GB")} to{" "}
                      {new Date(inv.period_end).toLocaleDateString("en-GB")}
                    </td>
                    <td className="py-3.5 px-4 uppercase font-semibold text-slate-700">
                      {inv.plan_tier}
                    </td>
                    <td className="py-3.5 px-4 uppercase text-slate-500">
                      {inv.payment_provider}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                      {formatPoisha(inv.amount_poisha)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <a
                        href={`/api/billing/invoices/${inv.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-3 w-3" />
                        Receipt
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upgrade / Change Plan Modal */}
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Choose Subscription Plan</h3>
                <p className="text-xs text-slate-500">Transparent pricing in BDT. Upgrade or downgrade anytime.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsUpgradeModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {checkoutError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {checkoutError}
                </div>
              )}

              {/* Billing Cycle Toggle */}
              <div className="flex justify-center">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setSelectedInterval("month")}
                    className={`rounded-lg px-4 py-1.5 text-xs font-bold transition ${
                      selectedInterval === "month"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Monthly Billing
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedInterval("year")}
                    className={`rounded-lg px-4 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                      selectedInterval === "year"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Yearly Billing
                    <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] text-emerald-800">
                      Save 2 Months
                    </span>
                  </button>
                </div>
              </div>

              {/* Plan Cards Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Pro */}
                <div
                  onClick={() => setSelectedPlan("pro")}
                  className={`rounded-2xl border-2 p-5 cursor-pointer transition ${
                    selectedPlan === "pro"
                      ? "border-blue-600 bg-blue-50/30 shadow-md"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-extrabold text-base text-slate-900">Pro Merchant</span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      Popular
                    </span>
                  </div>
                  <div className="text-xl font-black text-slate-900 mt-2">
                    ৳
                    {selectedInterval === "year"
                      ? PLANS.pro.yearlyPriceBdt.toLocaleString()
                      : PLANS.pro.monthlyPriceBdt.toLocaleString()}
                    <span className="text-xs font-normal text-slate-500">
                      /{selectedInterval === "year" ? "year" : "month"}
                    </span>
                  </div>
                  <ul className="text-xs text-slate-600 mt-4 space-y-1.5">
                    <li>• Up to 3 Branch Outlets</li>
                    <li>• 10 Staff Members</li>
                    <li>• 5,000 Catalog Products</li>
                    <li>• IMEI / Serial Tracking</li>
                    <li>• Full Reports & Export</li>
                  </ul>
                </div>

                {/* Business */}
                <div
                  onClick={() => setSelectedPlan("business")}
                  className={`rounded-2xl border-2 p-5 cursor-pointer transition ${
                    selectedPlan === "business"
                      ? "border-blue-600 bg-blue-50/30 shadow-md"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-extrabold text-base text-slate-900">Business</span>
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                      Enterprise
                    </span>
                  </div>
                  <div className="text-xl font-black text-slate-900 mt-2">
                    ৳
                    {selectedInterval === "year"
                      ? PLANS.business.yearlyPriceBdt.toLocaleString()
                      : PLANS.business.monthlyPriceBdt.toLocaleString()}
                    <span className="text-xs font-normal text-slate-500">
                      /{selectedInterval === "year" ? "year" : "month"}
                    </span>
                  </div>
                  <ul className="text-xs text-slate-600 mt-4 space-y-1.5">
                    <li>• Unlimited Branch Outlets</li>
                    <li>• Unlimited Staff Members</li>
                    <li>• 100,000 Products</li>
                    <li>• Priority 24/7 Support</li>
                    <li>• REST API & Webhooks</li>
                  </ul>
                </div>
              </div>

              {/* Payment Gateway Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Select Payment Gateway
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedProvider("sslcommerz")}
                    className={`rounded-xl border p-3.5 text-xs font-bold text-left transition ${
                      selectedProvider === "sslcommerz"
                        ? "border-blue-600 bg-blue-50 text-blue-800 shadow-sm"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div>SSLCommerz Gateway</div>
                    <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                      Cards (Visa/Mastercard), bKash, Nagad, Rocket, Net Banking
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedProvider("bkash")}
                    className={`rounded-xl border p-3.5 text-xs font-bold text-left transition ${
                      selectedProvider === "bkash"
                        ? "border-pink-600 bg-pink-50 text-pink-800 shadow-sm"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div>bKash Direct Checkout</div>
                    <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                      Instant mobile PIN & OTP payment via bKash Tokenized API
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50/50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsUpgradeModalOpen(false)}
                disabled={checkingOut}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={checkingOut}
                className="rounded-xl bg-blue-600 px-6 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {checkingOut ? "Redirecting..." : "Proceed to Gateway"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
