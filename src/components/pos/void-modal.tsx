"use client";

import React, { useState } from "react";
import { X, Ban, AlertTriangle, CheckCircle } from "lucide-react";
import { useTenant } from "@/context/tenant-context";

interface VoidModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}

export function VoidModal({ isOpen, onClose, tenantId }: VoidModalProps) {
  const { currentRole } = useTenant();

  const [invoiceOrId, setInvoiceOrId] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isAllowedRole = currentRole === "owner" || currentRole === "manager";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceOrId.trim() || !reason.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // First resolve sale ID if user entered invoice number
      const lookupRes = await fetch(
        `/api/pos/sales/${encodeURIComponent(invoiceOrId.trim())}?tenantId=${tenantId}`
      );
      const lookupJson = await lookupRes.json();

      if (!lookupRes.ok || !lookupJson.sale) {
        throw new Error(lookupJson.error || "Sale not found");
      }

      const saleId = lookupJson.sale.id;

      // Submit void
      const res = await fetch("/api/pos/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          sale_id: saleId,
          reason: reason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to void sale");
      }

      setSuccessMsg(`Sale ${lookupJson.sale.invoice_number} has been voided successfully. Stock has been restored.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error voiding sale";
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-rose-50/50">
          <div className="flex items-center gap-2 text-rose-800">
            <Ban className="h-5 w-5 text-rose-600" />
            <h3 className="font-bold text-lg">Void Sale (Manager Only)</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {!isAllowedRole ? (
            <div className="text-center py-6 space-y-3">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
              <p className="text-sm font-semibold text-slate-800">Permission Denied</p>
              <p className="text-xs text-slate-500">
                Only store Managers and Owners are authorized to void transactions. Cashiers cannot void sales.
              </p>
            </div>
          ) : successMsg ? (
            <div className="text-center py-6 space-y-3">
              <CheckCircle className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-900">{successMsg}</p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-slate-900 px-6 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="rounded-xl bg-rose-50/60 p-3 border border-rose-200/80 text-xs text-rose-800 space-y-1">
                <p className="font-bold">Warning: Permanent Reversal</p>
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  Voiding completely invalidates the sale, reverses inventory movements back into stock on hand, and restores any attached serial numbers.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Invoice Number or Sale ID *
                </label>
                <input
                  type="text"
                  required
                  value={invoiceOrId}
                  onChange={(e) => setInvoiceOrId(e.target.value)}
                  placeholder="e.g. INV-DHK-000001"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-rose-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Reason for Voiding *
                </label>
                <textarea
                  required
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Accidental double entry / test transaction"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !invoiceOrId.trim() || !reason.trim()}
                  className="rounded-xl bg-rose-600 px-6 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 transition shadow-xs"
                >
                  {isSubmitting ? "Voiding..." : "Void Sale"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
