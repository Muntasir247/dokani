"use client";

import React, { useState, useEffect } from "react";
import { useTenant } from "@/context/tenant-context";
import {
  Printer,
  Receipt,
  Percent,
  Coins,
  Building,
  CheckCircle2,
  AlertCircle,
  Save,
  FileText,
} from "lucide-react";

interface StoreSettingsData {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  phone: string | null;
  address: string | null;
  vat_bin_number: string | null;
  receipt_footer: string | null;
  invoice_prefix: string | null;
  default_paper_size: "80mm" | "a4";
  logo_url: string | null;
  payment_terms: string | null;
  bank_details: string | null;
  tax_enabled: boolean;
  default_tax_rate: number;
  default_currency: string;
  loyalty_enabled: boolean;
  loyalty_earn_rate_poisha: number;
  loyalty_redeem_rate_poisha: number;
}

export default function SettingsPage() {
  const { activeTenant } = useTenant();
  const [store, setStore] = useState<StoreSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [vatBin, setVatBin] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("");
  const [paperSize, setPaperSize] = useState<"80mm" | "a4">("80mm");
  const [logoUrl, setLogoUrl] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [bankDetails, setBankDetails] = useState("");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState(0);
  const [currency, setCurrency] = useState("BDT");
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyEarnTaka, setLoyaltyEarnTaka] = useState("10"); // 10 BDT = 1 pt (1000 poisha)
  const [loyaltyRedeemTaka, setLoyaltyRedeemTaka] = useState("1"); // 1 pt = 1 BDT (100 poisha)

  useEffect(() => {
    if (!activeTenant?.id) return;
    setLoading(true);

    fetch(`/api/settings/store?tenantId=${activeTenant.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.store) {
          const s: StoreSettingsData = data.store;
          setStore(s);
          setName(s.name || "");
          setPhone(s.phone || "");
          setAddress(s.address || "");
          setVatBin(s.vat_bin_number || "");
          setInvoicePrefix(s.invoice_prefix || "INV-");
          setPaperSize(s.default_paper_size || "80mm");
          setLogoUrl(s.logo_url || "");
          setReceiptFooter(s.receipt_footer || "");
          setPaymentTerms(s.payment_terms || "");
          setBankDetails(s.bank_details || "");
          setTaxEnabled(s.tax_enabled ?? false);
          setTaxRate(s.default_tax_rate ?? 0);
          setCurrency(s.default_currency || "BDT");
          setLoyaltyEnabled(s.loyalty_enabled ?? false);
          setLoyaltyEarnTaka(((s.loyalty_earn_rate_poisha || 1000) / 100).toString());
          setLoyaltyRedeemTaka(((s.loyalty_redeem_rate_poisha || 100) / 100).toString());
        }
      })
      .catch((err) => {
        setErrorMsg(err.message || "Failed to load store settings");
      })
      .finally(() => setLoadingInvoices(false));
  }, [activeTenant?.id]);

  const setLoadingInvoices = (val: boolean) => setLoading(val);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant?.id || !store?.id) return;

    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const earnPoisha = Math.round((parseFloat(loyaltyEarnTaka) || 10) * 100);
    const redeemPoisha = Math.round((parseFloat(loyaltyRedeemTaka) || 1) * 100);

    try {
      const res = await fetch("/api/settings/store", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: activeTenant.id,
          storeId: store.id,
          name: name.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          vatBinNumber: vatBin.trim() || null,
          invoicePrefix: invoicePrefix.trim() || null,
          defaultPaperSize: paperSize,
          logoUrl: logoUrl.trim() || null,
          receiptFooter: receiptFooter.trim() || null,
          paymentTerms: paymentTerms.trim() || null,
          bankDetails: bankDetails.trim() || null,
          taxEnabled,
          defaultTaxRate: Number(taxRate),
          defaultCurrency: currency.trim() || "BDT",
          loyaltyEnabled,
          loyaltyEarnRatePoisha: earnPoisha,
          loyaltyRedeemRatePoisha: redeemPoisha,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update store settings");
      }

      setSuccessMsg("Store settings, invoice layout, and loyalty rules updated successfully.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400 text-xs">
        Loading store settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Store & Invoice Settings</h1>
        <p className="text-sm text-slate-500">
          Configure business profile, VAT/BIN numbers, receipt formats, taxes, and loyalty points
        </p>
      </div>

      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Section 1: Business Details */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base pb-3 border-b border-slate-100">
            <Building className="h-5 w-5 text-blue-600" />
            <h3>Business & Outlet Identity</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Store / Outlet Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dokani Gadgets & Electronics"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+880 1XXXXXXXXX"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Shop 42, Level 3, Multiplan Center, Elephant Road, Dhaka"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mushak / VAT BIN Number (Bangladesh)
              </label>
              <input
                type="text"
                value={vatBin}
                onChange={(e) => setVatBin(e.target.value)}
                placeholder="e.g. 001234567-0101"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Printed on receipts and A4 tax invoices per NBR requirements
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Logo Image URL</label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Receipt & Printing Preferences */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base pb-3 border-b border-slate-100">
            <Printer className="h-5 w-5 text-blue-600" />
            <h3>Receipt & Printer Configuration</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Printer Paper Format
              </label>
              <div className="grid grid-cols-2 gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => setPaperSize("80mm")}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition ${
                    paperSize === "80mm"
                      ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Receipt className="h-4 w-4" />
                  80mm Thermal
                </button>
                <button
                  type="button"
                  onClick={() => setPaperSize("a4")}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition ${
                    paperSize === "a4"
                      ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  A4 Tax Invoice
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Number Prefix</label>
              <input
                type="text"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                placeholder="INV-"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-mono text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Custom Receipt Footer Message
            </label>
            <input
              type="text"
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              placeholder="e.g. Thank you! No return after 7 days without original invoice."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Section 3: B2B Terms & Bank Details */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base pb-3 border-b border-slate-100">
            <FileText className="h-5 w-5 text-blue-600" />
            <h3>B2B Wholesale & Payment Terms</h3>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Payment Terms (Printed on A4 B2B Invoices)
            </label>
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="e.g. Net 30 days. Cheques payable to Dokani Store Ltd."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Bank Wire / Routing Details
            </label>
            <textarea
              rows={3}
              value={bankDetails}
              onChange={(e) => setBankDetails(e.target.value)}
              placeholder={`Bank: City Bank Ltd, Principal Branch\nA/C Name: Dokani Tech Enterprises\nA/C No: 1102938475001\nRouting: 08526112`}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Section 4: Tax Configuration */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base">
              <Percent className="h-5 w-5 text-blue-600" />
              <h3>VAT / Tax Settings</h3>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={taxEnabled}
                onChange={(e) => setTaxEnabled(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              Enable VAT / Tax Collection
            </label>
          </div>

          {taxEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default Tax Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-mono text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default Currency
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="BDT"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-mono text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Section 5: Customer Loyalty Rewards Program */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base">
              <Coins className="h-5 w-5 text-amber-500" />
              <h3>Loyalty Points Program</h3>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={loyaltyEnabled}
                onChange={(e) => setLoyaltyEnabled(e.target.checked)}
                className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 h-4 w-4"
              />
              Enable Customer Loyalty Program
            </label>
          </div>

          {loyaltyEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Earn Rate (BDT Spent per 1 Point)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400 font-bold">৳</span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={loyaltyEarnTaka}
                    onChange={(e) => setLoyaltyEarnTaka(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 py-2 pl-7 pr-3 text-xs font-mono text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Example: ৳10 spent = 1 point earned (1000 poisha)
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Redemption Rate (BDT Discount per 1 Point)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400 font-bold">৳</span>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={loyaltyRedeemTaka}
                    onChange={(e) => setLoyaltyRedeemTaka(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 py-2 pl-7 pr-3 text-xs font-mono text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Example: 1 point redeemed = ৳1 bill discount (100 poisha)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Submit Actions */}
        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white shadow-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving Changes..." : "Save Store Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
