"use client";

import React, { useState } from "react";
import { X, RotateCcw, AlertCircle, CheckCircle } from "lucide-react";
import { formatBDT } from "@/lib/money";
import { PaymentMethod } from "@/types/database.types";

interface ReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  storeId: string;
  locationId: string;
}

export function ReturnModal({
  isOpen,
  onClose,
  tenantId,
  storeId,
  locationId,
}: ReturnModalProps) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [saleData, setSaleData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any>(null);

  // Return form items: map of saleItemId -> { quantity, restock }
  const [returnItemsState, setReturnItemsState] = useState<
    Record<string, { quantity: number; restock: boolean }>
  >({});
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("cash");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSearchSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) return;

    setIsSearching(true);
    setErrorMsg(null);
    setSaleData(null);
    setSuccessResult(null);

    try {
      // Find sale by invoice
      const res = await fetch(
        `/api/pos/sales/${encodeURIComponent(invoiceNumber.trim())}?tenantId=${tenantId}`
      );
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Sale not found");
      }

      setSaleData(json.sale);
      const initialMap: Record<string, { quantity: number; restock: boolean }> = {};
      (json.sale.sale_items || []).forEach((item: any) => {
        initialMap[item.id] = { quantity: 0, restock: true };
      });
      setReturnItemsState(initialMap);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error finding sale";
      setErrorMsg(msg);
    } finally {
      setIsSearching(false);
    }
  };

  const handleQtyChange = (itemId: string, maxQty: number, val: number) => {
    const clamped = Math.max(0, Math.min(maxQty, val));
    setReturnItemsState({
      ...returnItemsState,
      [itemId]: { ...returnItemsState[itemId], quantity: clamped },
    });
  };

  const handleRestockToggle = (itemId: string) => {
    setReturnItemsState({
      ...returnItemsState,
      [itemId]: {
        ...returnItemsState[itemId],
        restock: !returnItemsState[itemId]?.restock,
      },
    });
  };

  const handleSubmitReturn = async () => {
    const selectedItems = Object.entries(returnItemsState)
      .filter(([_, val]) => val.quantity > 0)
      .map(([saleItemId, val]) => {
        const originalItem = saleData.sale_items.find((si: any) => si.id === saleItemId);
        return {
          sale_item_id: saleItemId,
          variant_id: originalItem.variant_id,
          quantity: val.quantity,
          refund_unit_price: originalItem.unit_price,
          restock: val.restock,
          serials: originalItem.serial_numbers?.slice(0, val.quantity) || [],
        };
      });

    if (selectedItems.length === 0) {
      setErrorMsg("Please select at least one item to return");
      return;
    }

    if (!reason.trim()) {
      setErrorMsg("Return reason is required");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/pos/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          sale_id: saleData.id,
          store_id: storeId,
          location_id: locationId,
          items: selectedItems,
          refund_method: refundMethod,
          reason: reason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to process return");
      }

      setSuccessResult(json.return);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Return processing error";
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-600" />
            <h3 className="font-bold text-slate-900 text-lg">Process Return / Refund</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successResult ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle className="mx-auto h-12 w-12 text-emerald-600" />
              <h4 className="text-base font-bold text-slate-900">Return Completed Successfully!</h4>
              <p className="text-xs text-slate-500">
                Return Number: <span className="font-semibold text-slate-800">{successResult.return_number}</span>
              </p>
              <p className="text-xs font-bold text-emerald-600">
                Total Refund: {formatBDT(successResult.refund_amount)}
              </p>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-slate-900 px-6 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Lookup Invoice Search */}
              <form onSubmit={handleSearchSale} className="flex gap-2">
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Enter or scan original invoice (e.g. INV-DHK-000001)..."
                  className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSearching || !invoiceNumber.trim()}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40 transition"
                >
                  {isSearching ? "Searching..." : "Lookup"}
                </button>
              </form>

              {/* Sale Items Return Checklist */}
              {saleData && (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div className="flex justify-between items-center text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span>Invoice: <strong className="text-slate-900">{saleData.invoice_number}</strong></span>
                    <span>Date: {new Date(saleData.sold_at).toLocaleDateString()}</span>
                    <span>Status: <strong className="uppercase">{saleData.status}</strong></span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                      Select Items to Return
                    </label>

                    {saleData.sale_items?.map((item: any) => {
                      const returnState = returnItemsState[item.id] || { quantity: 0, restock: true };
                      const maxQty = item.quantity;

                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white"
                        >
                          <div className="space-y-0.5 max-w-[200px]">
                            <p className="text-xs font-bold text-slate-900">
                              {item.product_variants?.products?.name || "Product"}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Qty Sold: {item.quantity} • Unit: {formatBDT(item.unit_price)}
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[11px] text-slate-500">Return Qty:</label>
                              <input
                                type="number"
                                min="0"
                                max={maxQty}
                                value={returnState.quantity}
                                onChange={(e) =>
                                  handleQtyChange(item.id, maxQty, parseInt(e.target.value) || 0)
                                }
                                className="w-16 rounded-lg border border-slate-300 py-1 px-2 text-xs text-center font-bold"
                              />
                            </div>

                            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={returnState.restock}
                                onChange={() => handleRestockToggle(item.id)}
                                className="rounded text-emerald-600 focus:ring-emerald-500"
                              />
                              <span>Restock</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Refund Method & Reason */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Refund Method
                      </label>
                      <select
                        value={refundMethod}
                        onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="cash">Cash</option>
                        <option value="bkash">bKash</option>
                        <option value="nagad">Nagad</option>
                        <option value="card">Card</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Return Reason *
                      </label>
                      <input
                        type="text"
                        required
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Defective unit, customer exchange"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitReturn}
                      disabled={isSubmitting || !reason.trim()}
                      className="rounded-xl bg-amber-600 px-6 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50 transition shadow-xs"
                    >
                      {isSubmitting ? "Processing..." : "Confirm Return & Refund"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
