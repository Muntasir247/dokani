"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/context/tenant-context";
import {
  Users,
  Search,
  Plus,
  DollarSign,
  Award,
  Briefcase,
  Phone,
  Mail,
  ExternalLink,
  X,
  Building2,
} from "lucide-react";
import { formatPoisha } from "@/lib/receipts/templates";
import { CollectDueModal } from "@/components/customers/collect-due-modal";
import { CustomerPriceTier } from "@/types/database.types";

interface CustomerRecord {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  company_name: string | null;
  tax_id: string | null;
  price_tier: CustomerPriceTier;
  credit_limit: number;
  opening_balance: number;
  loyalty_points: number;
  current_due: number;
  created_at: string;
}

export default function CustomersPage() {
  const { activeTenant } = useTenant();
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [dueOnly, setDueOnly] = useState(false);

  // Modals state
  const [collectDueCustomer, setCollectDueCustomer] = useState<CustomerRecord | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<CustomerRecord | null>(null);
  const [customerHistoryData, setCustomerHistoryData] = useState<{
    sales: Array<{ id: string; invoice_number: string; sold_at: string; total_amount: number; paid_amount: number; due_amount: number; status: string; share_token: string }>;
    payments: Array<{ id: string; amount: number; payment_method: string; reference: string | null; notes: string | null; paid_at: string }>;
  } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // New Customer Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newTaxId, setNewTaxId] = useState("");
  const [newTier, setNewTier] = useState<CustomerPriceTier>("retail");
  const [newCreditLimitTaka, setNewCreditLimitTaka] = useState("");
  const [newOpeningBalanceTaka, setNewOpeningBalanceTaka] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async () => {
    if (!activeTenant?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pos/customers?tenantId=${activeTenant.id}&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data?.customers) {
        setCustomers(data.customers);
      }
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [activeTenant?.id, query]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const openHistory = async (cust: CustomerRecord) => {
    setHistoryCustomer(cust);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/customers/${cust.id}/history?tenantId=${activeTenant?.id}`);
      const data = await res.json();
      setCustomerHistoryData(data);
    } catch {
      // error handled
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant?.id) return;

    setSavingCustomer(true);
    setModalError(null);

    const creditLimitPoisha = Math.round((parseFloat(newCreditLimitTaka) || 0) * 100);
    const openingBalancePoisha = Math.round((parseFloat(newOpeningBalanceTaka) || 0) * 100);

    try {
      const res = await fetch("/api/pos/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: activeTenant.id,
          name: newName.trim(),
          phone: newPhone.trim() || undefined,
          email: newEmail.trim() || undefined,
          address: newAddress.trim() || undefined,
          credit_limit: creditLimitPoisha,
          opening_balance: openingBalancePoisha,
          price_tier: newTier,
          company_name: newCompany.trim() || undefined,
          tax_id: newTaxId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create customer");
      }

      setIsNewModalOpen(false);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setNewAddress("");
      setNewCompany("");
      setNewTaxId("");
      setNewCreditLimitTaka("");
      setNewOpeningBalanceTaka("");
      fetchCustomers();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Error creating customer");
    } finally {
      setSavingCustomer(false);
    }
  };

  // Filtered customer list
  const filteredCustomers = customers.filter((c) => {
    if (dueOnly && c.current_due <= 0) return false;
    if (tierFilter !== "all" && c.price_tier !== tierFilter) return false;
    return true;
  });

  // Aggregated Stats
  const totalDuesPoisha = customers.reduce((sum, c) => sum + (c.current_due > 0 ? c.current_due : 0), 0);
  const totalWholesale = customers.filter((c) => c.price_tier === "wholesale").length;
  const totalLoyaltyPoints = customers.reduce((sum, c) => sum + (c.loyalty_points || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customers & Dues</h1>
          <p className="text-sm text-slate-500">
            Track customer accounts, credit balances, loyalty points, and B2B wholesale pricing
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsNewModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Add Customer
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Customers</span>
            <Users className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{customers.length}</div>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-red-700 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Outstanding Dues</span>
            <DollarSign className="h-4 w-4 text-red-600" />
          </div>
          <div className="text-2xl font-extrabold text-red-700">{formatPoisha(totalDuesPoisha)}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">B2B / Wholesale</span>
            <Briefcase className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{totalWholesale}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Loyalty Points Issued</span>
            <Award className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{totalLoyaltyPoints.toLocaleString()} pts</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, company, or phone..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Tiers</option>
            <option value="retail">Retail Tier</option>
            <option value="wholesale">Wholesale Tier</option>
            <option value="custom">Custom Tier</option>
          </select>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dueOnly}
              onChange={(e) => setDueOnly(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Dues Only
          </label>
        </div>
      </div>

      {/* Customers Data Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Customer / Company</th>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-3">Price Tier</th>
                <th className="py-3.5 px-4 text-right">Credit Limit</th>
                <th className="py-3.5 px-4 text-right">Due Balance</th>
                <th className="py-3.5 px-4 text-center">Loyalty</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading customer accounts...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No customers found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{c.name}</div>
                      {c.company_name && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                          <Building2 className="h-3 w-3" />
                          {c.company_name}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      {c.phone ? (
                        <div className="flex items-center gap-1 font-mono text-[11px]">
                          <Phone className="h-3 w-3 text-slate-400" />
                          {c.phone}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                          <Mail className="h-2.5 w-2.5" />
                          {c.email}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          c.price_tier === "wholesale"
                            ? "bg-blue-100 text-blue-700"
                            : c.price_tier === "custom"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {c.price_tier}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono text-slate-600">
                      {c.credit_limit > 0 ? formatPoisha(c.credit_limit) : "No Credit"}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold">
                      <span className={c.current_due > 0 ? "text-red-600" : "text-emerald-600"}>
                        {formatPoisha(c.current_due)}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center font-semibold text-amber-600">
                      {c.loyalty_points || 0} pts
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {c.current_due > 0 && (
                        <button
                          type="button"
                          onClick={() => setCollectDueCustomer(c)}
                          className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 transition"
                        >
                          Collect Due
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openHistory(c)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition"
                      >
                        History
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collect Due Modal */}
      {collectDueCustomer && (
        <CollectDueModal
          isOpen={!!collectDueCustomer}
          onClose={() => setCollectDueCustomer(null)}
          tenantId={activeTenant?.id || ""}
          customer={collectDueCustomer}
          onSuccess={fetchCustomers}
        />
      )}

      {/* Customer Purchase & Payment History Modal */}
      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {historyCustomer.name} — Ledger & History
                </h3>
                <p className="text-xs text-slate-500">
                  Current Due: <strong className="text-red-600">{formatPoisha(historyCustomer.current_due)}</strong> | Tier: {historyCustomer.price_tier}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryCustomer(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {loadingHistory ? (
                <div className="text-center py-10 text-slate-400 text-xs">Loading ledger records...</div>
              ) : (
                <>
                  {/* Sales & Invoices History */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                      Sales & Invoices ({customerHistoryData?.sales?.length || 0})
                    </h4>
                    {customerHistoryData?.sales && customerHistoryData.sales.length > 0 ? (
                      <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                        {customerHistoryData.sales.map((s) => (
                          <div key={s.id} className="p-3 flex items-center justify-between hover:bg-slate-50/60">
                            <div>
                              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                #{s.invoice_number}
                                {s.share_token && (
                                  <a
                                    href={`/invoice/${s.share_token}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline inline-flex items-center gap-0.5 text-[11px]"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    View
                                  </a>
                                )}
                              </div>
                              <div className="text-slate-400 text-[10px]">
                                {new Date(s.sold_at).toLocaleDateString("en-GB")}
                              </div>
                            </div>
                            <div className="text-right font-mono">
                              <div className="font-bold text-slate-800">{formatPoisha(s.total_amount)}</div>
                              {s.due_amount > 0 ? (
                                <div className="text-red-600 text-[11px] font-semibold">
                                  Due: {formatPoisha(s.due_amount)}
                                </div>
                              ) : (
                                <div className="text-emerald-600 text-[10px]">Paid</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 py-3 italic">No sales recorded yet.</div>
                    )}
                  </div>

                  {/* Payment Collection Ledger */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                      Payments Received ({customerHistoryData?.payments?.length || 0})
                    </h4>
                    {customerHistoryData?.payments && customerHistoryData.payments.length > 0 ? (
                      <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                        {customerHistoryData.payments.map((p) => (
                          <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50/60">
                            <div>
                              <div className="font-semibold text-slate-800 capitalize">
                                {p.payment_method} Payment
                                {p.reference && <span className="font-normal text-slate-500"> (Ref: {p.reference})</span>}
                              </div>
                              <div className="text-slate-400 text-[10px]">
                                {new Date(p.paid_at).toLocaleDateString("en-GB")}
                              </div>
                              {p.notes && <div className="text-slate-500 text-[10px] mt-0.5">{p.notes}</div>}
                            </div>
                            <div className="text-right font-mono font-bold text-emerald-700">
                              +{formatPoisha(p.amount)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 py-3 italic">No payments collected yet.</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add New Customer Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900">Create Customer Profile</h3>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {modalError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Customer or Contact Name"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="optional@domain.com"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company (B2B)</label>
                  <input
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="Company / Shop Name"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tax / BIN ID</label>
                  <input
                    type="text"
                    value={newTaxId}
                    onChange={(e) => setNewTaxId(e.target.value)}
                    placeholder="Mushak / Tax ID"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Price Tier</label>
                <select
                  value={newTier}
                  onChange={(e) => setNewTier(e.target.value as CustomerPriceTier)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="retail">Retail (Standard MRP)</option>
                  <option value="wholesale">Wholesale (Trade Price)</option>
                  <option value="custom">Custom (Negotiated)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Credit Limit (BDT)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newCreditLimitTaka}
                    onChange={(e) => setNewCreditLimitTaka(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Opening Due (BDT)</label>
                  <input
                    type="number"
                    step="any"
                    value={newOpeningBalanceTaka}
                    onChange={(e) => setNewOpeningBalanceTaka(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
                <textarea
                  rows={2}
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Delivery or Billing Address"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  disabled={savingCustomer}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCustomer || !newName.trim()}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {savingCustomer ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
