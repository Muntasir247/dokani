"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Search, Phone, UserCheck, AlertCircle } from "lucide-react";
import { useCartStore, PosCustomer } from "@/lib/pos/cart-store";
import { formatBDT } from "@/lib/money";

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}

export function CustomerModal({ isOpen, onClose, tenantId }: CustomerModalProps) {
  const { selectedCustomer, setCustomer } = useCartStore();

  const [activeTab, setActiveTab] = useState<"search" | "create">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [customers, setCustomers] = useState<PosCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Quick create form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [creditLimitBDT, setCreditLimitBDT] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadCustomers = useCallback((query: string) => {
    setIsLoading(true);
    fetch(`/api/pos/customers?tenantId=${tenantId}&q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        const mapped: PosCustomer[] = (data.customers || []).map((c: any) => ({
          id: c.customer_id,
          name: c.name,
          phone: c.phone || "",
          currentDue: c.current_due || 0,
          creditLimit: c.credit_limit || 0,
        }));
        setCustomers(mapped);
      })
      .catch((err) => console.error("Customer fetch error:", err))
      .finally(() => setIsLoading(false));
  }, [tenantId]);

  useEffect(() => {
    if (!isOpen) return;
    loadCustomers(searchQuery);
  }, [isOpen, searchQuery, loadCustomers]);

  const handleSelect = (c: PosCustomer) => {
    setCustomer(c);
    onClose();
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/pos/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim() || null,
          credit_limit: Math.round(creditLimitBDT * 100),
          opening_balance: 0,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create customer");
      }

      const created = json.customer;
      const newPosCustomer: PosCustomer = {
        id: created.id,
        name: created.name,
        phone: created.phone || "",
        currentDue: 0,
        creditLimit: created.credit_limit || 0,
      };

      setCustomer(newPosCustomer);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating customer";
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900 text-lg">Customer Association</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-slate-200 px-6 pt-3 bg-slate-50">
          <button
            type="button"
            onClick={() => setActiveTab("search")}
            className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition ${
              activeTab === "search"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Search Customer
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("create")}
            className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition ${
              activeTab === "create"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            + Quick Add Customer
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          {errorMsg && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === "search" ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by customer name or phone..."
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm focus:border-emerald-500 focus:outline-none"
                  autoFocus
                />
              </div>

              {selectedCustomer && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                  <div>
                    <span className="font-semibold text-emerald-900">Attached: {selectedCustomer.name}</span>
                    <span className="text-emerald-700 ml-2">({selectedCustomer.phone})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomer(null)}
                    className="text-xs text-rose-600 hover:underline font-semibold"
                  >
                    Detach
                  </button>
                </div>
              )}

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {isLoading ? (
                  <p className="text-xs text-center py-6 text-slate-400">Loading customers...</p>
                ) : customers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-slate-400 mb-2">No matching customers found.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setName(searchQuery);
                        setActiveTab("create");
                      }}
                      className="text-xs font-semibold text-emerald-600 hover:underline"
                    >
                      Create customer &quot;{searchQuery}&quot;
                    </button>
                  </div>
                ) : (
                  customers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelect(c)}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition text-left"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500 font-medium">Due Balance</p>
                        <p
                          className={`text-xs font-bold ${
                            c.currentDue > 0 ? "text-amber-600" : "text-slate-700"
                          }`}
                        >
                          {formatBDT(c.currentDue)}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rafiqul Islam"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="017xxxxxxxx"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Address (Optional)
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Mirpur-10, Dhaka"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Credit Limit (BDT, 0 for unlimited)
                </label>
                <input
                  type="number"
                  min="0"
                  value={creditLimitBDT}
                  onChange={(e) => setCreditLimitBDT(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("search")}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim() || !phone.trim()}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition shadow-xs"
                >
                  {isSubmitting ? "Saving..." : "Create & Attach"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
