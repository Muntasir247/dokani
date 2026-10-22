"use client";

import React, { useState } from "react";
import { Search, ShieldCheck, ShieldAlert, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

interface WarrantyResult {
  found: boolean;
  message?: string;
  serialNumber?: string;
  status?: string;
  productName?: string;
  variantName?: string | null;
  sku?: string;
  warrantyMonths?: number;
  warrantyStart?: string | null;
  warrantyEnd?: string | null;
  isWarrantyValid?: boolean;
}

export default function WarrantyLookupPage() {
  const [serial, setSerial] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WarrantyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serial.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/warranty/lookup?serial=${encodeURIComponent(serial.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to lookup warranty");
      }

      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error connecting to warranty registry");
    } finally {
      setLoading(false);
    }
  };

  const getDaysRemaining = (endDateStr?: string | null) => {
    if (!endDateStr) return null;
    const diffTime = new Date(endDateStr).getTime() - new Date().getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysRemaining = result?.warrantyEnd ? getDaysRemaining(result.warrantyEnd) : null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between">
      {/* Navbar */}
      <header className="border-b border-slate-800 bg-slate-950/70 backdrop-blur px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20">
              D
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white">Dokani</span>
              <span className="text-xs text-blue-400 font-semibold ml-2 uppercase tracking-wider">
                Warranty Portal
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto w-full max-w-2xl px-4 py-12 flex-1 flex flex-col justify-center">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-400 mb-4">
            <ShieldCheck className="h-4 w-4" />
            Official Warranty & Authenticity Registry
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Check Device Warranty Status
          </h1>
          <p className="mt-3 text-sm text-slate-400 max-w-md mx-auto">
            Enter your product serial number or IMEI from your receipt or device box to check active warranty coverage.
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleLookup} className="relative mb-8">
          <div className="relative flex items-center">
            <Search className="absolute left-4 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="Enter Serial Number or IMEI (e.g. SN-987654321)"
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-4 pl-12 pr-32 text-sm text-white placeholder-slate-500 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition font-mono"
            />
            <button
              type="submit"
              disabled={loading || !serial.trim()}
              className="absolute right-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-500 disabled:opacity-50 transition"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
          </div>
        </form>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-300 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
            <div>{error}</div>
          </div>
        )}

        {/* Results Card */}
        {result && (
          <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-6 sm:p-8 backdrop-blur shadow-2xl transition">
            {result.found ? (
              <div>
                {/* Status Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 pb-5 mb-5">
                  <div>
                    <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                      Product Verified
                    </span>
                    <h2 className="text-xl font-extrabold text-white mt-0.5">
                      {result.productName}
                    </h2>
                    {result.variantName && (
                      <div className="text-xs text-slate-400">{result.variantName}</div>
                    )}
                  </div>

                  {result.isWarrantyValid ? (
                    <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Active Warranty
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3.5 py-1.5 text-xs font-bold text-red-400">
                      <ShieldAlert className="h-4 w-4" />
                      Warranty Expired
                    </div>
                  )}
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="rounded-lg bg-slate-900/60 p-3 border border-slate-800">
                    <span className="text-slate-400">Serial Number</span>
                    <div className="font-mono font-bold text-slate-200 mt-0.5 text-sm">
                      {result.serialNumber}
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-900/60 p-3 border border-slate-800">
                    <span className="text-slate-400">SKU / Model</span>
                    <div className="font-mono font-bold text-slate-200 mt-0.5 text-sm">
                      {result.sku || "—"}
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-900/60 p-3 border border-slate-800">
                    <span className="text-slate-400">Registered Date</span>
                    <div className="font-semibold text-slate-200 mt-0.5">
                      {result.warrantyStart
                        ? new Date(result.warrantyStart).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "Not Sold Yet"}
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-900/60 p-3 border border-slate-800">
                    <span className="text-slate-400">Expiry Date</span>
                    <div className="font-semibold text-slate-200 mt-0.5">
                      {result.warrantyEnd
                        ? new Date(result.warrantyEnd).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "Pending Sale"}
                    </div>
                  </div>
                </div>

                {/* Days remaining badge */}
                {daysRemaining !== null && (
                  <div className="mt-5 rounded-xl border border-slate-700/60 bg-slate-900/80 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-blue-400" />
                      <div>
                        <div className="text-xs font-semibold text-slate-300">Coverage Window</div>
                        <div className="text-xs text-slate-500">
                          {daysRemaining > 0
                            ? `${daysRemaining} days remaining of ${result.warrantyMonths || 12} months total coverage`
                            : `Coverage expired ${Math.abs(daysRemaining)} days ago`}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-700/50 text-slate-400 mb-3">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-white">No Record Found</h3>
                <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                  {result.message ||
                    "We could not find any matching record for this serial number. Please double check the characters on your invoice or packaging."}
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        Dokani Serial & Warranty Registry System &copy; 2026. All rights reserved.
      </footer>
    </div>
  );
}
