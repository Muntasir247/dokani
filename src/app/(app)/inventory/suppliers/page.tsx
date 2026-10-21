"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/context/tenant-context";
import { Truck, Plus, Phone, Mail, MapPin, Trash2, X, Loader2 } from "lucide-react";
import { formatBDT, toPoisha } from "@/lib/money";

interface SupplierBalance {
  supplier_id: string;
  tenant_id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number;
  total_purchased: number;
  total_paid: number;
  current_due: number;
  last_purchase_at: string | null;
}

export default function SuppliersPage() {
  const { activeTenant } = useTenant();

  const [suppliers, setSuppliers] = useState<SupplierBalance[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // New Supplier Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [openingBalanceBDT, setOpeningBalanceBDT] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchSuppliers = useCallback(async () => {
    if (!activeTenant) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory/suppliers?tenantId=${activeTenant.id}`);
      if (res.ok) {
        const json = await res.json();
        setSuppliers(json.suppliers || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [activeTenant]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/inventory/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: activeTenant.id,
          name: name.trim(),
          company: company.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          opening_balance: toPoisha(parseFloat(openingBalanceBDT) || 0),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErrorMessage(json.error || "Failed to create supplier.");
      } else {
        setIsModalOpen(false);
        setName("");
        setCompany("");
        setPhone("");
        setEmail("");
        setAddress("");
        setOpeningBalanceBDT("0");
        fetchSuppliers();
      }
    } catch {
      setErrorMessage("Network error creating supplier.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSupplier = async (supplierId: string, supplierName: string) => {
    if (!activeTenant) return;
    if (!confirm(`Are you sure you want to archive supplier "${supplierName}"?`)) return;

    try {
      const res = await fetch(
        `/api/inventory/suppliers/${supplierId}?tenantId=${activeTenant.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        fetchSuppliers();
      }
    } catch (err) {
      console.error("Failed to delete supplier", err);
    }
  };

  const totalDueAcrossAllSuppliers = suppliers.reduce((acc, s) => acc + s.current_due, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Suppliers & Due Tracking
          </h1>
          <p className="text-sm text-slate-500">
            Track suppliers, contact details, total purchases, and outstanding accounts payable
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
        >
          <Plus className="h-4 w-4" />
          <span>New Supplier</span>
        </button>
      </div>

      {/* Total Due Summary Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">Total Outstanding Payable</span>
            <p className="text-xl font-bold text-slate-900">
              {formatBDT(totalDueAcrossAllSuppliers)}
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <span className="font-bold text-slate-800">{suppliers.length}</span> active vendors
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-500">Loading suppliers...</div>
        ) : suppliers.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
              <Truck className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No suppliers added</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Add your vendors and distributors to track purchases and ledger dues.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Add First Supplier</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Supplier / Company</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Total Purchases</th>
                  <th className="py-3 px-4">Total Paid</th>
                  <th className="py-3 px-4">Current Due (Payable)</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((s) => (
                  <tr key={s.supplier_id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 text-sm">{s.name}</span>
                      {s.company && (
                        <span className="text-slate-500 block text-xs">{s.company}</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 space-y-0.5">
                      {s.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-slate-400" />
                          <span>{s.phone}</span>
                        </div>
                      )}
                      {s.email && (
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Mail className="h-3 w-3 text-slate-400" />
                          <span>{s.email}</span>
                        </div>
                      )}
                      {s.address && (
                        <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          <span className="line-clamp-1">{s.address}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-800">
                      {formatBDT(s.total_purchased)}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-emerald-700">
                      {formatBDT(s.total_paid)}
                    </td>

                    <td className="py-3.5 px-4">
                      {s.current_due > 0 ? (
                        <span className="rounded-lg bg-rose-50 px-2 py-1 font-mono font-bold text-rose-700 border border-rose-200">
                          {formatBDT(s.current_due)} Due
                        </span>
                      ) : (
                        <span className="rounded-lg bg-emerald-50 px-2 py-1 font-mono font-bold text-emerald-700 border border-emerald-200">
                          Settled (৳0.00)
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleDeleteSupplier(s.supplier_id, s.name)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                        title="Archive Supplier"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Supplier Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Add New Supplier</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleCreateSupplier} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Supplier / Contact Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Al-Madina Gadgets & Wholesale"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Company Name</label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Anker Bangladesh Ltd."
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700">Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="017xxxxxxxx"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vendor@example.com"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Opening Balance / Due (৳)</label>
                <input
                  type="number"
                  step="0.01"
                  value={openingBalanceBDT}
                  onChange={(e) => setOpeningBalanceBDT(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Address / Market Location</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Shop 42, Multiplan Center, Elephant Road, Dhaka"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Supplier</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
