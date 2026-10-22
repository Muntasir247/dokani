"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
} from "lucide-react";
import { useCartStore } from "@/lib/pos/cart-store";
import { formatBDT } from "@/lib/money";
import { calculatePaymentBreakdown } from "@/lib/pos/pricing";
import { PaymentMethod } from "@/types/database.types";
import { outboxProcessor } from "@/lib/offline/outbox-processor";
import { getNextOfflineInvoiceNumber } from "@/lib/offline/device";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaleCompleted: (sale: Record<string, unknown>) => void;
  tenantId: string;
  storeId: string;
  locationId: string;
}

interface PaymentEntry {
  method: PaymentMethod;
  amount: number; // In BDT
  reference: string;
}

export function PaymentModal({
  isOpen,
  onClose,
  onSaleCompleted,
  tenantId,
  storeId,
  locationId,
}: PaymentModalProps) {
  const { items, selectedCustomer, cartDiscountType, cartDiscountValue, getTotals, clearCart } =
    useCartStore();

  const totals = getTotals();
  const totalAmountPoisha = totals.totalAmountPoisha;
  const totalAmountBDT = totalAmountPoisha / 100;

  // Split payment state
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { method: "cash", amount: totalAmountBDT, reference: "" },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync default cash amount when modal opens or total changes
  useEffect(() => {
    if (isOpen) {
      setPayments([{ method: "cash", amount: totalAmountBDT, reference: "" }]);
      setErrorMsg(null);
    }
  }, [isOpen, totalAmountBDT]);

  if (!isOpen) return null;

  // Calculate live breakdown
  const paymentsPoisha = payments.map((p) => ({
    method: p.method,
    amountPoisha: Math.round(p.amount * 100),
  }));

  const breakdown = calculatePaymentBreakdown({
    totalAmountPoisha,
    payments: paymentsPoisha,
  });

  const totalPaidBDT = breakdown.totalPaidPoisha / 100;
  const changeBDT = breakdown.changeAmountPoisha / 100;
  const dueBDT = breakdown.dueAmountPoisha / 100;

  const handleMethodToggle = (method: PaymentMethod) => {
    const existing = payments.find((p) => p.method === method);
    if (existing) {
      if (payments.length > 1) {
        setPayments(payments.filter((p) => p.method !== method));
      }
    } else {
      const remainingBDT = Math.max(0, totalAmountBDT - totalPaidBDT);
      setPayments([...payments, { method, amount: remainingBDT, reference: "" }]);
    }
  };

  const handleAmountChange = (method: PaymentMethod, val: number) => {
    setPayments(
      payments.map((p) => (p.method === method ? { ...p, amount: Math.max(0, val) } : p))
    );
  };

  const handleRefChange = (method: PaymentMethod, ref: string) => {
    setPayments(
      payments.map((p) => (p.method === method ? { ...p, reference: ref } : p))
    );
  };

  const setExactCash = (amount: number) => {
    setPayments([{ method: "cash", amount, reference: "" }]);
  };

  const handleSubmit = async () => {
    if (items.length === 0) {
      setErrorMsg("Cart is empty");
      return;
    }

    if (breakdown.hasDue && !selectedCustomer) {
      setErrorMsg("Outstanding due requires an attached customer. Please attach a customer first.");
      return;
    }

    // Check customer credit limit
    if (
      breakdown.hasDue &&
      selectedCustomer &&
      selectedCustomer.creditLimit > 0 &&
      selectedCustomer.currentDue + breakdown.dueAmountPoisha > selectedCustomer.creditLimit
    ) {
      setErrorMsg(
        `Customer credit limit exceeded! Limit: ${formatBDT(selectedCustomer.creditLimit)}, New Due: ${formatBDT(
          selectedCustomer.currentDue + breakdown.dueAmountPoisha
        )}`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        tenant_id: tenantId,
        store_id: storeId,
        location_id: locationId,
        customer_id: selectedCustomer?.id || null,
        items: items.map((i) => ({
          variant_id: i.variantId,
          quantity: i.quantity,
          discount_type: i.discountType,
          discount_value: i.discountValue,
          serials: i.selectedSerials,
        })),
        cart_discount_type: cartDiscountType,
        cart_discount_value: cartDiscountValue,
        payments: paymentsPoisha.filter((p) => p.amountPoisha > 0).map((p) => ({
          method: p.method,
          amount: p.amountPoisha,
          reference: payments.find((x) => x.method === p.method)?.reference || null,
        })),
        client_reported_total: totalAmountPoisha,
      };

      const completeOfflineSale = async () => {
        const offlineInvoiceNumber = await getNextOfflineInvoiceNumber(tenantId);
        const outboxEntry = await outboxProcessor.enqueueMutation({
          tenantId,
          storeId,
          mutationType: "create_sale",
          payload: {
            ...payload,
            locationId,
            offlineInvoiceNumber,
          },
        });

        const offlineSale = {
          id: outboxEntry.id,
          invoice_number: offlineInvoiceNumber,
          offline_invoice_number: offlineInvoiceNumber,
          subtotal: totalAmountPoisha,
          discount_amount: 0,
          tax_amount: 0,
          total_amount: totalAmountPoisha,
          paid_amount: breakdown.totalPaidPoisha,
          due_amount: breakdown.dueAmountPoisha,
          change_amount: breakdown.changeAmountPoisha,
          created_at: new Date().toISOString(),
          sold_at: new Date().toISOString(),
          is_offline: true,
          items: items.map((i) => ({
            id: `item_${i.variantId}`,
            variant_id: i.variantId,
            variant: { id: i.variantId, name: i.variantName, sku: i.sku, retail_price: i.unitPricePoisha },
            quantity: i.quantity,
            unit_price: i.unitPricePoisha,
            subtotal: i.unitPricePoisha * i.quantity,
            serial_numbers: i.selectedSerials,
          })),
          customer: selectedCustomer,
          payments: payload.payments,
        };

        clearCart();
        onSaleCompleted(offlineSale);
        onClose();
      };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await completeOfflineSale();
        return;
      }

      try {
        const res = await fetch("/api/pos/sale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Failed to process sale");
        }

        clearCart();
        onSaleCompleted(json.sale);
        onClose();
      } catch (fetchErr: unknown) {
        // If network disconnected mid-checkout, fall back to offline queue!
        const isNetworkFailure =
          (typeof navigator !== "undefined" && !navigator.onLine) ||
          (fetchErr instanceof TypeError && fetchErr.message.includes("fetch"));

        if (isNetworkFailure) {
          await completeOfflineSale();
        } else {
          throw fetchErr;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment processing error";
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Checkout & Payment</h2>
            <p className="text-xs text-slate-500">
              Total Payable:{" "}
              <span className="font-semibold text-emerald-600 text-sm">
                {formatBDT(totalAmountPoisha)}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-700 border border-rose-200">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Attached Customer Status */}
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5 border border-slate-200">
            <div className="flex items-center gap-2.5">
              <UserCheck className="h-4 w-4 text-slate-500" />
              <span className="text-xs text-slate-600">Customer:</span>
              <span className="text-xs font-semibold text-slate-800">
                {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.phone})` : "Walk-in Customer (Cash only)"}
              </span>
            </div>
            {selectedCustomer && (
              <span className="text-xs text-amber-700 font-medium">
                Current Due: {formatBDT(selectedCustomer.currentDue)}
              </span>
            )}
          </div>

          {/* Payment Method Toggles */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-2.5">
              Select Payment Methods (Split Payment Supported)
            </label>
            <div className="grid grid-cols-5 gap-2.5">
              {[
                { id: "cash", label: "Cash", icon: Banknote },
                { id: "bkash", label: "bKash", icon: Smartphone },
                { id: "nagad", label: "Nagad", icon: Smartphone },
                { id: "card", label: "Card", icon: CreditCard },
                { id: "due", label: "Credit/Due", icon: Clock },
              ].map((m) => {
                const isSelected = payments.some((p) => p.method === m.id);
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleMethodToggle(m.id as PaymentMethod)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition ${
                      isSelected
                        ? "border-emerald-600 bg-emerald-50/70 text-emerald-800 shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className={`h-5 w-5 mb-1.5 ${isSelected ? "text-emerald-600" : "text-slate-400"}`} />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount Inputs for Active Methods */}
          <div className="space-y-3.5">
            {payments.map((p) => (
              <div
                key={p.method}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs"
              >
                <div className="w-24 shrink-0 font-semibold text-xs text-slate-700 uppercase">
                  {p.method}
                </div>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">৳</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={p.amount}
                    onChange={(e) => handleAmountChange(p.method, parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-300 py-2 pl-7 pr-3 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none"
                    placeholder="0"
                  />
                </div>
                {(p.method === "bkash" || p.method === "nagad" || p.method === "card") && (
                  <input
                    type="text"
                    value={p.reference}
                    onChange={(e) => handleRefChange(p.method, e.target.value)}
                    className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
                    placeholder="TrxID / Last 4"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Quick Cash Buttons */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-2">
              Quick Cash Tendered
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setExactCash(totalAmountBDT)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                Exact (৳{totalAmountBDT})
              </button>
              {[500, 1000, 2000, 5000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setExactCash(val)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                >
                  ৳{val}
                </button>
              ))}
            </div>
          </div>

          {/* Change & Due Summary Bar */}
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-100/80 p-4 text-center">
            <div>
              <p className="text-xs text-slate-500 font-medium">Total Paid</p>
              <p className="text-lg font-bold text-slate-900">৳{totalPaidBDT.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Change Due</p>
              <p className={`text-lg font-bold ${changeBDT > 0 ? "text-emerald-600" : "text-slate-700"}`}>
                ৳{changeBDT.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Outstanding Due</p>
              <p className={`text-lg font-bold ${dueBDT > 0 ? "text-amber-600" : "text-slate-700"}`}>
                ৳{dueBDT.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel (Esc)
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-7 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            {isSubmitting ? (
              <span>Processing Sale...</span>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Complete Sale (Enter)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
