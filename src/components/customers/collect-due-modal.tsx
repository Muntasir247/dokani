"use client";

import React, { useState, useEffect } from "react";
import { X, AlertCircle } from "lucide-react";
import { formatPoisha } from "@/lib/receipts/templates";
import { PaymentMethod } from "@/types/database.types";

interface OpenInvoiceOption {
  id: string;
  invoice_number: string;
  due_amount: number;
  total_amount: number;
  sold_at: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  customer: {
    id: string;
    name: string;
    phone?: string | null;
    current_due: number;
  } | null;
  onSuccess: () => void;
}

export function CollectDueModal({ isOpen, onClose, tenantId, customer, onSuccess }: Props) {
  const [amountTaka, setAmountTaka] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [selectedSaleId, setSelectedSaleId] = useState<string>("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<OpenInvoiceOption[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Load unpaid invoices for this customer
  useEffect(() => {
    if (isOpen && customer) {
      setLoadingInvoices(true);
      fetch(`/api/customers/${customer.id}/history?tenantId=${tenantId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.sales) {
            const unpaid = data.sales.filter((s: { due_amount: number }) => s.due_amount > 0);
            setInvoices(unpaid);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingInvoices(false));

      // Preset payment amount to full due
      if (customer.current_due > 0) {
        setAmountTaka((customer.current_due / 100).toString());
      } else {
        setAmountTaka("");
      }
      setSelectedSaleId("");
      setReference("");
      setNotes("");
      setError(null);
    }
  }, [isOpen, customer, tenantId]);

  if (!isOpen || !customer) return null;

  const currentDuePoisha = customer.current_due;
  const parsedPoisha = Math.round(parseFloat(amountTaka || "0") * 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(parsedPoisha) || parsedPoisha <= 0) {
      setError("Please enter a valid payment amount greater than zero.");
      return;
    }

    if (selectedSaleId) {
      const selectedInv = invoices.find((inv) => inv.id === selectedSaleId);
      if (selectedInv && parsedPoisha > selectedInv.due_amount) {
        setError(
          `Payment amount cannot exceed the invoice due amount (${formatPoisha(selectedInv.due_amount)}).`
        );
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/customers/due-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          customerId: customer.id,
          amountPoisha: parsedPoisha,
          paymentMethod: method,
          saleId: selectedSaleId || null,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to record payment");
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error collecting payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Collect Due Payment</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Customer: <span className="font-semibold text-slate-700">{customer.name}</span>
              {customer.phone && ` (${customer.phone})`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Due Highlight */}
          <div className="rounded-xl bg-amber-50 border border-amber-200/60 p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                Total Outstanding Due
              </span>
              <div className="text-xl font-black text-amber-900 mt-0.5">
                {formatPoisha(currentDuePoisha)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAmountTaka((currentDuePoisha / 100).toString())}
              className="text-xs font-bold text-amber-800 hover:text-amber-900 bg-amber-200/60 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition"
            >
              Pay Full Due
            </button>
          </div>

          {/* Payment Allocation: Invoice vs General Balance */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Allocate Against Specific Invoice (Optional)
            </label>
            <select
              value={selectedSaleId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedSaleId(val);
                if (val) {
                  const inv = invoices.find((i) => i.id === val);
                  if (inv) {
                    setAmountTaka((inv.due_amount / 100).toString());
                  }
                }
              }}
              disabled={loadingInvoices}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">General Account Balance (No specific invoice)</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  Invoice #{inv.invoice_number} — Due: {formatPoisha(inv.due_amount)} (of {formatPoisha(inv.total_amount)})
                </option>
              ))}
            </select>
          </div>

          {/* Payment Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Payment Amount (BDT) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">৳</span>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={amountTaka}
                onChange={(e) => setAmountTaka(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Payment Method *
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(["cash", "bkash", "nagad", "card"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-xl border py-2.5 text-xs font-bold capitalize transition ${
                    method === m
                      ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Reference / TrxID */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Transaction Reference / TrxID
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. bKash TrxID or Money Receipt No."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional payment notes"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || parsedPoisha <= 0}
              className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              {loading ? "Recording..." : "Confirm Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
