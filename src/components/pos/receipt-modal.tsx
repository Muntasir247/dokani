"use client";

import React, { useRef } from "react";
import { X, Printer, CheckCircle, ArrowRight } from "lucide-react";
import { formatBDT } from "@/lib/money";

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: any;
  storeName?: string;
}

export function ReceiptModal({ isOpen, onClose, sale, storeName = "Dokani Retail Store" }: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    window.print();
  };

  const invoiceNumber = sale.invoice_number || `INV-${sale.id?.slice(0, 8)}`;
  const dateFormatted = new Date().toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-emerald-50/50">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <h3 className="font-bold text-lg">Sale Completed!</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Printable Receipt Preview (80mm standard POS styling) */}
        <div className="overflow-y-auto p-6 flex justify-center bg-slate-100/50">
          <div
            ref={receiptRef}
            id="printable-receipt"
            className="w-full max-w-[320px] bg-white p-5 rounded-xl border border-slate-200 shadow-sm font-mono text-xs text-slate-800 space-y-3"
          >
            {/* Header info */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
              <h2 className="text-base font-bold uppercase tracking-tight text-slate-900">{storeName}</h2>
              <p className="text-[11px] text-slate-500">Dhaka, Bangladesh</p>
              <p className="text-[11px] font-bold text-slate-700">Invoice: {invoiceNumber}</p>
              <p className="text-[10px] text-slate-400">{dateFormatted}</p>
            </div>

            {/* Financial summary */}
            <div className="space-y-1.5 pt-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal:</span>
                <span>{formatBDT(sale.subtotal || sale.total_amount)}</span>
              </div>
              {sale.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount:</span>
                  <span>-{formatBDT(sale.discount_amount)}</span>
                </div>
              )}
              {sale.tax_amount > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>VAT / Tax:</span>
                  <span>+{formatBDT(sale.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm text-slate-900 pt-1.5 border-t border-slate-300">
                <span>Total Amount:</span>
                <span>{formatBDT(sale.total_amount)}</span>
              </div>
              <div className="flex justify-between text-slate-600 pt-1">
                <span>Paid Amount:</span>
                <span>{formatBDT(sale.paid_amount || sale.total_amount)}</span>
              </div>
              {sale.change_amount > 0 && (
                <div className="flex justify-between font-bold text-emerald-700">
                  <span>Change Given:</span>
                  <span>{formatBDT(sale.change_amount)}</span>
                </div>
              )}
              {sale.due_amount > 0 && (
                <div className="flex justify-between font-bold text-amber-700">
                  <span>Customer Due:</span>
                  <span>{formatBDT(sale.due_amount)}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center pt-4 border-t border-dashed border-slate-300 text-[10px] text-slate-400 space-y-0.5">
              <p>Thank you for shopping with us!</p>
              <p className="font-semibold text-slate-600">Dokani POS • Powered by Antigravity</p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
          >
            <Printer className="h-4 w-4 text-slate-600" />
            <span>Print Receipt</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-md"
          >
            <span>Next Customer</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
