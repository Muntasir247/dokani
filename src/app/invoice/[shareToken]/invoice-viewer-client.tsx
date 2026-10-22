/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState } from "react";
import { Printer, MessageCircle, Copy, Check, FileText, Receipt } from "lucide-react";
import { formatPoisha, getWhatsAppShareUrl } from "@/lib/receipts/templates";

export interface PublicInvoiceData {
  sale: {
    id: string;
    invoiceNumber: string;
    soldAt: string;
    shareToken: string;
    status: string;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
    changeAmount: number;
  };
  store: {
    id: string;
    name: string;
    code: string;
    address?: string | null;
    phone?: string | null;
    vat_bin_number?: string | null;
    logo_url?: string | null;
    receipt_footer?: string | null;
    payment_terms?: string | null;
    bank_details?: string | null;
    default_currency?: string;
    default_paper_size?: "80mm" | "a4";
  };
  customer?: {
    id: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    company_name?: string | null;
    tax_id?: string | null;
    price_tier?: string;
  } | null;
  items: Array<{
    id: string;
    name: string;
    variantName?: string | null;
    sku: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    subtotal: number;
    serialNumbers?: string[];
    warrantyMonths?: number;
  }>;
  payments: Array<{
    method: string;
    amount: number;
    reference?: string | null;
    paidAt: string;
  }>;
}

interface Props {
  invoice: PublicInvoiceData;
  initialFormat?: "80mm" | "a4";
}

export function InvoiceViewerClient({ invoice, initialFormat = "80mm" }: Props) {
  const [format, setFormat] = useState<"80mm" | "a4">(initialFormat);
  const [copied, setCopied] = useState(false);

  const currencySymbol = invoice.store.default_currency === "USD" ? "$" : "৳";
  const publicUrl = typeof window !== "undefined" ? window.location.href : "";
  const whatsappUrl = getWhatsAppShareUrl(publicUrl, invoice.sale.invoiceNumber, invoice.store.name);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* Action / Toolbar (Hidden when printing) */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-sm print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-900">{invoice.store.name}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              #{invoice.sale.invoiceNumber}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Format Selector */}
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setFormat("80mm")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  format === "80mm" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Receipt className="h-3.5 w-3.5" />
                80mm Thermal
              </button>
              <button
                type="button"
                onClick={() => setFormat("a4")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  format === "a4" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                A4 Invoice
              </button>
            </div>

            {/* Action Buttons */}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-blue-700 transition"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-700 transition"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>

            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy Link"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Preview Container */}
      <main className="p-4 sm:p-8 flex justify-center print:p-0 print:m-0">
        {format === "80mm" ? (
          /* 80mm Thermal Receipt View */
          <div className="w-full max-w-[340px] rounded-lg bg-white p-6 shadow-md border border-slate-200 font-mono text-xs print:border-none print:shadow-none print:p-0 print:max-w-none print:w-[80mm]">
            {/* Header */}
            <div className="text-center mb-4">
              {invoice.store.logo_url && (
                <img
                  src={invoice.store.logo_url}
                  alt={invoice.store.name}
                  className="mx-auto max-h-12 mb-2 object-contain"
                />
              )}
              <h2 className="text-base font-extrabold uppercase tracking-wide text-black">
                {invoice.store.name}
              </h2>
              {invoice.store.address && <div className="text-slate-600 mt-0.5">{invoice.store.address}</div>}
              {invoice.store.phone && <div className="text-slate-600">Tel: {invoice.store.phone}</div>}
              {invoice.store.vat_bin_number && (
                <div className="font-bold text-black mt-1">Mushak BIN: {invoice.store.vat_bin_number}</div>
              )}
            </div>

            <div className="border-t border-dashed border-slate-400 my-3"></div>

            {/* Meta */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Inv: #{invoice.sale.invoiceNumber}</span>
                <span>{new Date(invoice.sale.soldAt).toLocaleDateString("en-GB")}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Time: {new Date(invoice.sale.soldAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="capitalize">{invoice.sale.status}</span>
              </div>
              {invoice.customer && (
                <div className="pt-1 text-slate-700">
                  <div className="font-semibold">Customer: {invoice.customer.name}</div>
                  {invoice.customer.phone && <div>Phone: {invoice.customer.phone}</div>}
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-slate-400 my-3"></div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex justify-between font-bold text-slate-900 border-b border-slate-300 pb-1">
                <span>Item</span>
                <span>Qty / Total</span>
              </div>
              {invoice.items.map((item, idx) => (
                <div key={item.id} className="text-slate-800">
                  <div className="font-semibold">
                    {idx + 1}. {item.name}
                  </div>
                  {item.variantName && <div className="text-slate-500 text-[11px]">{item.variantName}</div>}
                  {item.serialNumbers && item.serialNumbers.length > 0 && (
                    <div className="text-slate-500 text-[10px]">S/N: {item.serialNumbers.join(", ")}</div>
                  )}
                  <div className="flex justify-between text-[11px] mt-0.5">
                    <span>
                      {item.quantity} x {formatPoisha(item.unitPrice, currencySymbol)}
                      {item.discountAmount > 0 && ` (-${formatPoisha(item.discountAmount, currencySymbol)})`}
                    </span>
                    <span className="font-bold">{formatPoisha(item.subtotal, currencySymbol)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-slate-400 my-3"></div>

            {/* Totals */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatPoisha(invoice.sale.subtotal, currencySymbol)}</span>
              </div>
              {invoice.sale.discountAmount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount:</span>
                  <span>-{formatPoisha(invoice.sale.discountAmount, currencySymbol)}</span>
                </div>
              )}
              {invoice.sale.taxAmount > 0 && (
                <div className="flex justify-between">
                  <span>VAT / Tax:</span>
                  <span>+{formatPoisha(invoice.sale.taxAmount, currencySymbol)}</span>
                </div>
              )}
              <div className="border-t-2 border-black pt-1 flex justify-between font-extrabold text-sm text-black">
                <span>NET TOTAL:</span>
                <span>{formatPoisha(invoice.sale.totalAmount, currencySymbol)}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-slate-400 my-3"></div>

            {/* Payments */}
            <div className="space-y-1 text-slate-700">
              {invoice.payments.map((p, idx) => (
                <div key={idx} className="flex justify-between capitalize">
                  <span>{p.method}{p.reference ? ` (${p.reference})` : ""}:</span>
                  <span>{formatPoisha(p.amount, currencySymbol)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-black pt-1">
                <span>Paid:</span>
                <span>{formatPoisha(invoice.sale.paidAmount, currencySymbol)}</span>
              </div>
              {invoice.sale.changeAmount > 0 && (
                <div className="flex justify-between">
                  <span>Change:</span>
                  <span>{formatPoisha(invoice.sale.changeAmount, currencySymbol)}</span>
                </div>
              )}
              {invoice.sale.dueAmount > 0 && (
                <div className="flex justify-between font-bold text-red-600 border-t border-dotted border-red-400 pt-1">
                  <span>CURRENT DUE:</span>
                  <span>{formatPoisha(invoice.sale.dueAmount, currencySymbol)}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-slate-400 my-4"></div>

            {/* Footer */}
            <div className="text-center text-slate-500 text-[11px] space-y-1">
              <div>{invoice.store.receipt_footer || "Thank you for shopping with us!"}</div>
              <div className="text-[10px] text-slate-400">Powered by Dokani POS</div>
            </div>
          </div>
        ) : (
          /* A4 Tax Invoice View */
          <div className="w-full max-w-[850px] rounded-lg bg-white p-8 sm:p-12 shadow-md border border-slate-200 text-sm print:border-none print:shadow-none print:p-0 print:max-w-none">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-sky-600 pb-6 mb-6 gap-4">
              <div>
                {invoice.store.logo_url && (
                  <img
                    src={invoice.store.logo_url}
                    alt={invoice.store.name}
                    className="max-h-14 mb-2 object-contain"
                  />
                )}
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">{invoice.store.name}</h1>
                {invoice.store.address && <div className="text-slate-600 mt-1">{invoice.store.address}</div>}
                {invoice.store.phone && <div className="text-slate-600">Phone: {invoice.store.phone}</div>}
                {invoice.store.vat_bin_number && (
                  <div className="mt-2 inline-block rounded bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
                    Mushak / VAT BIN: {invoice.store.vat_bin_number}
                  </div>
                )}
              </div>

              <div className="text-left sm:text-right">
                <div className="text-2xl font-black uppercase tracking-wider text-sky-600">TAX INVOICE</div>
                <div className="text-lg font-bold text-slate-800 mt-1">#{invoice.sale.invoiceNumber}</div>
                <div className="text-slate-500 text-xs mt-1">
                  Date: {new Date(invoice.sale.soldAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </div>
                {invoice.store.payment_terms && (
                  <div className="text-slate-500 text-xs mt-0.5">Payment Terms: {invoice.store.payment_terms}</div>
                )}
              </div>
            </div>

            {/* Bill To & Status Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              <div className="rounded-lg bg-slate-50 p-4 border border-slate-200">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Bill To (Client)
                </div>
                {invoice.customer ? (
                  <div className="space-y-1">
                    <div className="text-base font-bold text-slate-900">{invoice.customer.name}</div>
                    {invoice.customer.company_name && (
                      <div className="font-medium text-slate-700">{invoice.customer.company_name}</div>
                    )}
                    {invoice.customer.address && <div className="text-slate-600 text-xs">{invoice.customer.address}</div>}
                    {invoice.customer.phone && <div className="text-slate-600 text-xs">Phone: {invoice.customer.phone}</div>}
                    {invoice.customer.tax_id && (
                      <div className="text-xs font-semibold text-sky-700 mt-1">BIN/TIN: {invoice.customer.tax_id}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-slate-500 italic">Walk-in Customer</div>
                )}
              </div>

              <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Invoice Status
                  </div>
                  <div className={`text-xl font-extrabold ${invoice.sale.dueAmount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {invoice.sale.dueAmount > 0 ? "PARTIAL / DUE" : "PAID IN FULL"}
                  </div>
                </div>
                <div className="text-xs text-slate-600 space-y-0.5 pt-2 border-t border-slate-200 mt-2">
                  <div>Tendered: <strong>{formatPoisha(invoice.sale.paidAmount, currencySymbol)}</strong></div>
                  {invoice.sale.dueAmount > 0 && (
                    <div className="text-red-600 font-bold">
                      Outstanding Due: {formatPoisha(invoice.sale.dueAmount, currencySymbol)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="overflow-x-auto mb-8 border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-xs font-bold uppercase text-slate-600 border-b border-slate-200">
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-4">Item & Description</th>
                    <th className="py-3 px-3 text-center w-16">Qty</th>
                    <th className="py-3 px-4 text-right w-28">Unit Price</th>
                    <th className="py-3 px-4 text-right w-24">Discount</th>
                    <th className="py-3 px-4 text-right w-32">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {invoice.items.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 text-center text-slate-400 text-xs">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        {item.variantName && <div className="text-xs text-slate-500">{item.variantName}</div>}
                        <div className="text-[11px] text-slate-400 font-mono">SKU: {item.sku}</div>
                        {item.serialNumbers && item.serialNumbers.length > 0 && (
                          <div className="text-xs text-slate-600 mt-1">S/N: {item.serialNumbers.join(", ")}</div>
                        )}
                        {item.warrantyMonths && item.warrantyMonths > 0 && (
                          <span className="inline-block mt-1 rounded bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                            {item.warrantyMonths} Mo. Warranty
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-medium">{item.quantity}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        {formatPoisha(item.unitPrice, currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-red-600">
                        {item.discountAmount > 0 ? `-${formatPoisha(item.discountAmount, currencySymbol)}` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatPoisha(item.subtotal, currencySymbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Summary Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
              {/* Payment Details & Terms */}
              <div className="space-y-4">
                {invoice.store.bank_details && (
                  <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 text-xs">
                    <div className="font-bold uppercase text-slate-600 mb-1">Bank Payment Details</div>
                    <div className="text-slate-700 whitespace-pre-line">{invoice.store.bank_details}</div>
                  </div>
                )}

                {invoice.payments.length > 0 && (
                  <div className="text-xs space-y-1">
                    <div className="font-bold uppercase text-slate-600 mb-1">Payment Tendered Breakdown</div>
                    {invoice.payments.map((p, idx) => (
                      <div key={idx} className="flex justify-between py-1 border-b border-dotted border-slate-200 capitalize">
                        <span>{p.method}{p.reference ? ` (Ref: ${p.reference})` : ""}:</span>
                        <span className="font-mono font-semibold">{formatPoisha(p.amount, currencySymbol)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {invoice.store.receipt_footer && (
                  <div className="text-xs text-slate-500 italic">{invoice.store.receipt_footer}</div>
                )}
              </div>

              {/* Financial Totals Card */}
              <div className="rounded-lg bg-slate-50 p-6 border border-slate-200 space-y-2.5">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono font-semibold">{formatPoisha(invoice.sale.subtotal, currencySymbol)}</span>
                </div>
                {invoice.sale.discountAmount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Invoice Discount:</span>
                    <span className="font-mono font-semibold">-{formatPoisha(invoice.sale.discountAmount, currencySymbol)}</span>
                  </div>
                )}
                {invoice.sale.taxAmount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>VAT / Tax:</span>
                    <span className="font-mono font-semibold">+{formatPoisha(invoice.sale.taxAmount, currencySymbol)}</span>
                  </div>
                )}
                <div className="border-t-2 border-slate-300 pt-3 flex justify-between text-lg font-black text-slate-900">
                  <span>Total Payable:</span>
                  <span className="font-mono text-sky-600">{formatPoisha(invoice.sale.totalAmount, currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-slate-600 pt-1">
                  <span>Amount Tendered:</span>
                  <span className="font-mono font-semibold">{formatPoisha(invoice.sale.paidAmount, currencySymbol)}</span>
                </div>
                {invoice.sale.changeAmount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Change Returned:</span>
                    <span className="font-mono font-semibold">{formatPoisha(invoice.sale.changeAmount, currencySymbol)}</span>
                  </div>
                )}
                <div className="border-t border-slate-300 pt-2 flex justify-between font-bold text-base">
                  <span className={invoice.sale.dueAmount > 0 ? "text-red-600" : "text-emerald-700"}>Current Due:</span>
                  <span className={`font-mono ${invoice.sale.dueAmount > 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {formatPoisha(invoice.sale.dueAmount, currencySymbol)}
                  </span>
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div className="mt-16 pt-8 border-t border-slate-200 flex justify-between text-xs text-slate-500">
              <div className="text-center w-48 border-t border-dashed border-slate-400 pt-2">
                Customer Signature
              </div>
              <div className="text-center w-48 border-t border-slate-900 pt-2 font-bold text-slate-900">
                Authorized Signatory
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
