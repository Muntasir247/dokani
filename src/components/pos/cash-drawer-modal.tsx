"use client";

import React, { useState, useEffect } from "react";
import { formatBDT } from "@/lib/money";
import { X, DollarSign, ArrowDownRight, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";

interface CashDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  storeId: string;
}

interface ActiveSession {
  id: string;
  opened_at: string;
  opening_float_poisha: number;
  status: "open" | "closed";
  notes?: string;
  transactions?: Array<{
    id: string;
    type: "cash_in" | "cash_out";
    amount_poisha: number;
    reason: string;
    created_at: string;
  }>;
}

export function CashDrawerModal({ isOpen, onClose, tenantId, storeId }: CashDrawerModalProps) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form states
  const [openingFloatBdt, setOpeningFloatBdt] = useState<string>("500");
  const [openNotes, setOpenNotes] = useState<string>("");

  // Cash In / Out
  const [txType, setTxType] = useState<"cash_in" | "cash_out">("cash_in");
  const [txAmountBdt, setTxAmountBdt] = useState<string>("");
  const [txReason, setTxReason] = useState<string>("");
  const [showTxForm, setShowTxForm] = useState(false);

  // Close shift
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [countedCashBdt, setCountedCashBdt] = useState<string>("");
  const [closeNotes, setCloseNotes] = useState<string>("");
  const [closedSummary, setClosedSummary] = useState<Record<string, unknown> | null>(null);

  const fetchSession = React.useCallback(async () => {
    if (!tenantId || !storeId) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/shifts/active?tenantId=${tenantId}&storeId=${storeId}`);
      if (!res.ok) {
        const json = await res.json();
        setErrorMsg(json.error || "Failed to load active shift");
        return;
      }
      const data = await res.json();
      setActiveSession(data.activeSession);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, storeId]);

  useEffect(() => {
    if (isOpen) {
      fetchSession();
      setClosedSummary(null);
      setActionSuccess(null);
    }
  }, [isOpen, fetchSession]);

  if (!isOpen) return null;

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const floatPoisha = Math.round(parseFloat(openingFloatBdt || "0") * 100);
      const res = await fetch("/api/shifts/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          storeId,
          openingFloatPoisha: floatPoisha,
          notes: openNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to open shift");
        return;
      }
      setActionSuccess("Shift opened successfully!");
      await fetchSession();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const amountPoisha = Math.round(parseFloat(txAmountBdt || "0") * 100);
      const res = await fetch("/api/shifts/tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          sessionId: activeSession.id,
          type: txType,
          amountPoisha,
          reason: txReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to record cash transaction");
        return;
      }
      setTxAmountBdt("");
      setTxReason("");
      setShowTxForm(false);
      setActionSuccess(`Recorded ${txType === "cash_in" ? "Cash In" : "Cash Out"}`);
      await fetchSession();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const countedPoisha = Math.round(parseFloat(countedCashBdt || "0") * 100);
      const res = await fetch("/api/shifts/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          sessionId: activeSession.id,
          countedCashPoisha: countedPoisha,
          notes: closeNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to close shift");
        return;
      }
      setClosedSummary(data);
      setActiveSession(null);
      setShowCloseForm(false);
      setActionSuccess("Shift successfully closed!");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Cash Drawer Shift</h3>
              <p className="text-xs text-slate-500">Register floats, in/out entries, and shift closing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {actionSuccess && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* If shift was just closed, display closing report summary */}
          {closedSummary && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                <CheckCircle2 className="h-5 w-5" />
                <span>Shift Closed Successfully</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-slate-500">Opening Float</span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {formatBDT(Number(closedSummary.openingFloatPoisha || 0))}
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-slate-500">Cash Sales</span>
                  <div className="font-bold text-emerald-600 text-sm mt-0.5">
                    {formatBDT(Number(closedSummary.cashSalesPoisha || 0))}
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-slate-500">Expected Cash</span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {formatBDT(Number(closedSummary.expectedCashPoisha || 0))}
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-slate-500">Counted Cash</span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {formatBDT(Number(closedSummary.countedCashPoisha || 0))}
                  </div>
                </div>
              </div>

              {/* Variance badge */}
              <div
                className={`p-3 rounded-xl text-center font-bold text-sm border ${
                  Number(closedSummary.variancePoisha || 0) === 0
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : Number(closedSummary.variancePoisha || 0) < 0
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
                }`}
              >
                {Number(closedSummary.variancePoisha || 0) === 0 ? (
                  "Perfect Balance: ৳0.00 Variance"
                ) : (
                  <>
                    Variance:{" "}
                    {Number(closedSummary.variancePoisha || 0) < 0 ? "Shortage of " : "Surplus of "}
                    {formatBDT(Math.abs(Number(closedSummary.variancePoisha || 0)))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ACTIVE SHIFT VIEW */}
          {activeSession ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                      Drawer Shift Active
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    Opened {new Date(activeSession.opened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-xs text-slate-600">Opening Cash Float:</span>
                  <span className="text-lg font-bold text-slate-900">
                    {formatBDT(activeSession.opening_float_poisha)}
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              {!showTxForm && !showCloseForm && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowTxForm(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white p-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <ArrowDownRight className="h-4 w-4 text-blue-600" />
                    <span>Cash In / Out</span>
                  </button>
                  <button
                    onClick={() => setShowCloseForm(true)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 p-3 text-xs font-semibold text-white hover:bg-slate-800 transition"
                  >
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>Close Shift</span>
                  </button>
                </div>
              )}

              {/* CASH IN / OUT FORM */}
              {showTxForm && (
                <form onSubmit={handleAddTx} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Manual Cash Adjustment
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowTxForm(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTxType("cash_in")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${
                        txType === "cash_in"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      + Cash In (Add Money)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxType("cash_out")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${
                        txType === "cash_out"
                          ? "bg-rose-600 text-white border-rose-600"
                          : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      - Cash Out (Take Out)
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Amount (BDT ৳)</label>
                    <input
                      type="number"
                      step="any"
                      required
                      min="1"
                      value={txAmountBdt}
                      onChange={(e) => setTxAmountBdt(e.target.value)}
                      placeholder="e.g. 500"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Reason</label>
                    <input
                      type="text"
                      required
                      value={txReason}
                      onChange={(e) => setTxReason(e.target.value)}
                      placeholder="e.g. Added change, Bank deposit, Petty cash"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {isLoading ? "Saving..." : "Save Adjustment"}
                  </button>
                </form>
              )}

              {/* CLOSE SHIFT FORM */}
              {showCloseForm && (
                <form onSubmit={handleCloseShift} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      End of Shift Cash Count
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowCloseForm(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Count physical cash notes & coins in the drawer and enter below.
                  </p>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Counted Physical Cash (BDT ৳)</label>
                    <input
                      type="number"
                      step="any"
                      required
                      min="0"
                      value={countedCashBdt}
                      onChange={(e) => setCountedCashBdt(e.target.value)}
                      placeholder="e.g. 4500"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-base font-bold text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Shift Notes (Optional)</label>
                    <input
                      type="text"
                      value={closeNotes}
                      onChange={(e) => setCloseNotes(e.target.value)}
                      placeholder="e.g. Handover to evening shift"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isLoading ? "Calculating & Closing..." : "Verify & Close Shift"}
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* NO ACTIVE SHIFT: OPEN NEW SHIFT FORM */
            <form onSubmit={handleOpenShift} className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Open New Shift
                </span>
                <p className="mt-1 text-xs text-slate-500">
                  Enter the opening float in the cash drawer at the start of your work shift.
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-600 font-medium">
                  Opening Float Amount (BDT ৳)
                </label>
                <div className="relative mt-1">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 font-bold">
                    ৳
                  </span>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0"
                    value={openingFloatBdt}
                    onChange={(e) => setOpeningFloatBdt(e.target.value)}
                    placeholder="500"
                    className="w-full rounded-xl border border-slate-200 pl-8 pr-3 py-2.5 text-base font-bold text-slate-900 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-600 font-medium">Opening Notes (Optional)</label>
                <input
                  type="text"
                  value={openNotes}
                  onChange={(e) => setOpenNotes(e.target.value)}
                  placeholder="e.g. Morning register float"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {isLoading ? "Opening Shift..." : "Open Cash Drawer Shift"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
