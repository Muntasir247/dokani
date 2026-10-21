"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/context/tenant-context";
import {
  Boxes,
  PlusCircle,
  AlertTriangle,
  ArrowRightLeft,
  ClipboardList,
  Sliders,
  History,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { formatBDT, toPoisha } from "@/lib/money";
import { parseBulkSerials } from "@/lib/inventory/serials";

interface StockItem {
  tenant_id: string;
  location_id: string;
  store_id: string;
  store_name: string;
  location_name: string;
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  barcode: string | null;
  cost_price: number;
  retail_price: number;
  reorder_point: number;
  current_stock: number;
  is_low_stock: boolean;
}

interface Supplier {
  supplier_id: string;
  name: string;
  company: string | null;
  current_due: number;
}

interface RecentMovement {
  id: string;
  type: string;
  quantity: number;
  unit_cost: number;
  notes: string | null;
  created_at: string;
  product_variants: {
    name: string;
    sku: string;
    products: { name: string };
  };
  stock_locations: {
    name: string;
    stores: { name: string };
  };
}

export default function InventoryPage() {
  const { activeTenant } = useTenant();

  const [activeTab, setActiveTab] = useState<
    "overview" | "receive" | "adjust" | "stocktake" | "transfer" | "serials"
  >("overview");

  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [recentMovements, setRecentMovements] = useState<RecentMovement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  // Form States for Operations
  // 1. Receive Purchase Form State
  const [poSupplierId, setPoSupplierId] = useState("");
  const [poInvoiceNumber, setPoInvoiceNumber] = useState("");
  const [poVariantId, setPoVariantId] = useState("");
  const [poQuantity, setPoQuantity] = useState("10");
  const [poUnitCostBDT, setPoUnitCostBDT] = useState("100.00");
  const [poPaidAmountBDT, setPoPaidAmountBDT] = useState("0");
  const [poSerialsRaw, setPoSerialsRaw] = useState("");
  const [isReceiving, setIsReceiving] = useState(false);

  // 2. Adjust Stock Form State
  const [adjVariantId, setAdjVariantId] = useState("");
  const [adjDeltaQty, setAdjDeltaQty] = useState("-1");
  const [adjReason, setAdjReason] = useState("Damaged goods / breakage");
  const [adjNotes, setAdjNotes] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);

  // 3. Stock Take Form State
  const [takeVariantId, setTakeVariantId] = useState("");
  const [takeCountedQty, setTakeCountedQty] = useState("0");
  const [isStockTaking, setIsStockTaking] = useState(false);

  // 4. Transfer Form State
  const [trVariantId, setTrVariantId] = useState("");
  const [trQuantity, setTrQuantity] = useState("1");
  const [isTransferring, setIsTransferring] = useState(false);

  // 5. Serials Search State
  const [serialSearch, setSerialSearch] = useState("");
  const [serialsList, setSerialsList] = useState<Array<{
    id: string;
    serial_number: string;
    status: string;
    warranty_months: number;
    times_sold: number;
    sold_at: string | null;
    product_variants: { name: string; sku: string; products: { name: string } };
    stock_locations: { name: string; stores: { name: string } };
  }>>([]);

  const loadData = useCallback(async () => {
    if (!activeTenant) return;
    setIsLoading(true);
    try {
      const [stockRes, supRes] = await Promise.all([
        fetch(`/api/inventory/stock?tenantId=${activeTenant.id}`),
        fetch(`/api/inventory/suppliers?tenantId=${activeTenant.id}`),
      ]);

      if (stockRes.ok) {
        const json = await stockRes.json();
        setStockItems(json.stockItems || []);
        setRecentMovements(json.recentMovements || []);
      }
      if (supRes.ok) {
        const json = await supRes.json();
        setSuppliers(json.suppliers || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [activeTenant]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load Serials when Serials tab is activated
  const loadSerials = useCallback(async () => {
    if (!activeTenant) return;
    try {
      const params = new URLSearchParams({ tenantId: activeTenant.id });
      if (serialSearch.trim()) params.set("search", serialSearch.trim());
      const res = await fetch(`/api/inventory/serials?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setSerialsList(json.serials || []);
      }
    } catch (err) {
      console.error("Failed to load serials", err);
    }
  }, [activeTenant, serialSearch]);

  useEffect(() => {
    if (activeTab === "serials") {
      loadSerials();
    }
  }, [activeTab, loadSerials]);

  // Operation Handlers
  const handleReceivePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant || !poSupplierId || !poVariantId || !poInvoiceNumber) {
      setFeedback({ type: "error", message: "Please fill in all required purchase fields." });
      return;
    }

    setIsReceiving(true);
    setFeedback(null);

    try {
      const firstStock = stockItems.find((s) => s.variant_id === poVariantId);
      const storeId = firstStock?.store_id;

      const qty = parseInt(poQuantity, 10);
      const unitCostPoisha = toPoisha(parseFloat(poUnitCostBDT) || 0);
      const paidPoisha = toPoisha(parseFloat(poPaidAmountBDT) || 0);
      const serials = parseBulkSerials(poSerialsRaw).serials;

      const res = await fetch("/api/inventory/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: activeTenant.id,
          store_id: storeId,
          supplier_id: poSupplierId,
          invoice_number: poInvoiceNumber.trim(),
          items: [
            {
              variant_id: poVariantId,
              quantity: qty,
              unit_cost: unitCostPoisha,
              serials,
            },
          ],
          paid_amount: paidPoisha,
          notes: "Received via admin portal",
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", message: json.error || "Failed to receive purchase." });
      } else {
        setFeedback({
          type: "success",
          message: `Purchase invoice #${poInvoiceNumber} received. Stock & Weighted-Average Cost updated.`,
        });
        setPoInvoiceNumber("");
        setPoSerialsRaw("");
        loadData();
      }
    } catch {
      setFeedback({ type: "error", message: "Network error receiving purchase." });
    } finally {
      setIsReceiving(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant || !adjVariantId) {
      setFeedback({ type: "error", message: "Please select a product variant to adjust." });
      return;
    }

    setIsAdjusting(true);
    setFeedback(null);

    try {
      const selectedItem = stockItems.find((s) => s.variant_id === adjVariantId);
      if (!selectedItem) throw new Error("Variant location not found");

      const delta = parseInt(adjDeltaQty, 10);
      const res = await fetch("/api/inventory/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: activeTenant.id,
          location_id: selectedItem.location_id,
          variant_id: adjVariantId,
          delta_quantity: delta,
          reason: adjReason,
          notes: adjNotes || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", message: json.error || "Failed to adjust stock." });
      } else {
        setFeedback({
          type: "success",
          message: `Stock adjusted by ${delta > 0 ? `+${delta}` : delta} units directly to ledger.`,
        });
        setAdjNotes("");
        loadData();
      }
    } catch {
      setFeedback({ type: "error", message: "Network error adjusting stock." });
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleStockTake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant || !takeVariantId) {
      setFeedback({ type: "error", message: "Please select a product variant to reconcile." });
      return;
    }

    setIsStockTaking(true);
    setFeedback(null);

    try {
      const selectedItem = stockItems.find((s) => s.variant_id === takeVariantId);
      if (!selectedItem) throw new Error("Variant location not found");

      const counted = parseInt(takeCountedQty, 10);
      const res = await fetch("/api/inventory/stock-take", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: activeTenant.id,
          location_id: selectedItem.location_id,
          variant_id: takeVariantId,
          counted_quantity: counted,
          notes: "Audit cycle count",
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", message: json.error || "Failed to reconcile cycle count." });
      } else {
        setFeedback({
          type: "success",
          message: `Cycle count reconciled. Stock balance set to exactly ${counted} units.`,
        });
        loadData();
      }
    } catch {
      setFeedback({ type: "error", message: "Network error reconciling cycle count." });
    } finally {
      setIsStockTaking(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant || !trVariantId) {
      setFeedback({ type: "error", message: "Please select a variant to transfer." });
      return;
    }

    setIsTransferring(true);
    setFeedback(null);

    try {
      // Find source and target locations
      const itemsForVariant = stockItems.filter((s) => s.variant_id === trVariantId);
      if (itemsForVariant.length < 2) {
        // If only 1 location exists in tenant, notify user
        setFeedback({
          type: "error",
          message: "Transfer requires at least two branch locations in this store.",
        });
        setIsTransferring(false);
        return;
      }

      const fromLoc = itemsForVariant[0].location_id;
      const toLoc = itemsForVariant[1].location_id;
      const qty = parseInt(trQuantity, 10);

      const res = await fetch("/api/inventory/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: activeTenant.id,
          from_location_id: fromLoc,
          to_location_id: toLoc,
          variant_id: trVariantId,
          quantity: qty,
          notes: "Inter-branch rebalance",
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", message: json.error || "Transfer failed." });
      } else {
        setFeedback({
          type: "success",
          message: `Transferred ${qty} units atomically between branches.`,
        });
        loadData();
      }
    } catch {
      setFeedback({ type: "error", message: "Network error during transfer." });
    } finally {
      setIsTransferring(false);
    }
  };

  const lowStockItems = stockItems.filter((s) => s.is_low_stock);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Inventory & Stock Operations
        </h1>
        <p className="text-sm text-slate-500">
          Append-only ledger operations: receiving, adjustments, cycle counts, and inter-branch transfers
        </p>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl p-3.5 text-xs font-semibold border ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {[
          { id: "overview", label: "Stock On Hand & Alerts", icon: Boxes },
          { id: "receive", label: "Receive Purchase", icon: PlusCircle },
          { id: "adjust", label: "Adjust Stock", icon: Sliders },
          { id: "stocktake", label: "Cycle Count (Stock Take)", icon: ClipboardList },
          { id: "transfer", label: "Branch Transfer", icon: ArrowRightLeft },
          { id: "serials", label: "Serial Numbers", icon: QrCode },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as typeof activeTab);
                setFeedback(null);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & LOW-STOCK ALERTS */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Low Stock Alert Banner */}
          {lowStockItems.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Low Stock Warnings ({lowStockItems.length} items at or below reorder level)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {lowStockItems.map((item) => (
                  <div
                    key={`${item.variant_id}-${item.location_id}`}
                    className="flex items-center justify-between rounded-lg border border-amber-200 bg-white p-2.5 text-xs shadow-sm"
                  >
                    <div>
                      <p className="font-bold text-slate-800 line-clamp-1">{item.product_name}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.variant_name} ({item.sku})
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-amber-700">{item.current_stock} left</span>
                      <p className="text-[10px] text-slate-400">Reorder at {item.reorder_point}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Real-Time Stock Table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/50 p-4">
              <h3 className="text-sm font-bold text-slate-900">Current Stock by Location</h3>
              <p className="text-xs text-slate-500">
                Calculated strictly in real-time from immutable ledger movements
              </p>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading stock balances...</div>
            ) : stockItems.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">No stock records yet.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">Item & Variant</th>
                    <th className="py-2.5 px-4">Location</th>
                    <th className="py-2.5 px-4">SKU / Barcode</th>
                    <th className="py-2.5 px-4">Unit Cost (WAC)</th>
                    <th className="py-2.5 px-4">Stock on Hand</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockItems.map((item) => (
                    <tr key={`${item.variant_id}-${item.location_id}`} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900">{item.product_name}</span>
                        <span className="text-slate-500 block text-[11px]">{item.variant_name}</span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {item.store_name} ({item.location_name})
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">{item.sku}</td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {formatBDT(item.cost_price)}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                        {item.current_stock}
                      </td>
                      <td className="py-3 px-4">
                        {item.current_stock <= 0 ? (
                          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                            Out of Stock
                          </span>
                        ) : item.is_low_stock ? (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                            Low Stock
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            In Stock
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Ledger Movement History */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4 text-slate-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Recent Append-Only Ledger Movements
              </h3>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {recentMovements.length === 0 ? (
                <p className="text-slate-400 py-3">No movements recorded yet.</p>
              ) : (
                recentMovements.map((m) => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800">
                        {m.product_variants.products.name} ({m.product_variants.name})
                      </span>
                      <p className="text-[11px] text-slate-400">
                        {m.stock_locations.stores.name} • {m.notes || m.type}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`font-mono font-bold ${
                          m.quantity > 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity} units
                      </span>
                      <p className="text-[10px] text-slate-400">
                        {new Date(m.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RECEIVE PURCHASE */}
      {activeTab === "receive" && (
        <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-1">Receive Inbound Purchase</h3>
          <p className="text-xs text-slate-500 mb-4">
            Receiving inbound stock automatically recalculates Weighted Average Cost (WAC) and updates supplier due.
          </p>

          <form onSubmit={handleReceivePurchase} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700">Supplier *</label>
                <select
                  required
                  value={poSupplierId}
                  onChange={(e) => setPoSupplierId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.supplier_id} value={s.supplier_id}>
                      {s.name} {s.company ? `(${s.company})` : ""} - Due: {formatBDT(s.current_due)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Invoice Number *</label>
                <input
                  type="text"
                  required
                  value={poInvoiceNumber}
                  onChange={(e) => setPoInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-SUP-2026-004"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700">Product Variant *</label>
              <select
                required
                value={poVariantId}
                onChange={(e) => {
                  setPoVariantId(e.target.value);
                  const item = stockItems.find((s) => s.variant_id === e.target.value);
                  if (item) setPoUnitCostBDT((item.cost_price / 100).toFixed(2));
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
              >
                <option value="">-- Select Variant to Receive --</option>
                {stockItems.map((s) => (
                  <option key={`${s.variant_id}-${s.location_id}`} value={s.variant_id}>
                    {s.product_name} - {s.variant_name} ({s.sku}) [Current: {s.current_stock}]
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="font-semibold text-slate-700">Quantity *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={poQuantity}
                  onChange={(e) => setPoQuantity(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Unit Cost (৳) *</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={poUnitCostBDT}
                  onChange={(e) => setPoUnitCostBDT(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Amount Paid Now (৳)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={poPaidAmountBDT}
                  onChange={(e) => setPoPaidAmountBDT(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold text-emerald-700 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Optional Serials */}
            <div>
              <label className="font-semibold text-slate-700">
                Unit Serials (Optional - Paste comma/newline separated list)
              </label>
              <textarea
                value={poSerialsRaw}
                onChange={(e) => setPoSerialsRaw(e.target.value)}
                rows={2}
                placeholder="SN-1001, SN-1002, SN-1003"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isReceiving}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {isReceiving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Processing Receiving...</span>
                  </>
                ) : (
                  <span>Submit Purchase to Ledger</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: ADJUST STOCK */}
      {activeTab === "adjust" && (
        <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-1">Manual Stock Adjustment</h3>
          <p className="text-xs text-slate-500 mb-4">
            Adjust physical quantities for breakage, theft, or adjustments. Reason is strictly required for audit trails.
          </p>

          <form onSubmit={handleAdjustStock} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700">Product Variant *</label>
              <select
                required
                value={adjVariantId}
                onChange={(e) => setAdjVariantId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
              >
                <option value="">-- Select Variant --</option>
                {stockItems.map((s) => (
                  <option key={`${s.variant_id}-${s.location_id}`} value={s.variant_id}>
                    {s.product_name} - {s.variant_name} ({s.sku}) [On Hand: {s.current_stock}]
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700">Delta Quantity (+/-) *</label>
                <input
                  type="number"
                  required
                  value={adjDeltaQty}
                  onChange={(e) => setAdjDeltaQty(e.target.value)}
                  placeholder="-1 for loss, +5 for found"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-mono font-bold focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Required Reason *</label>
                <select
                  required
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  <option value="Damaged goods / breakage">Damaged goods / breakage</option>
                  <option value="Expired / perished">Expired / perished</option>
                  <option value="Theft / shoplifting">Theft / shoplifting</option>
                  <option value="Found unrecorded stock">Found unrecorded stock</option>
                  <option value="Internal shop use / sample">Internal shop use / sample</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700">Notes / Investigation Details</label>
              <input
                type="text"
                value={adjNotes}
                onChange={(e) => setAdjNotes(e.target.value)}
                placeholder="e.g. Broken during transit from godown"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isAdjusting}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {isAdjusting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Recording Adjustment...</span>
                </>
              ) : (
                <span>Record Adjustment Movement</span>
              )}
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: CYCLE COUNT / STOCK TAKE */}
      {activeTab === "stocktake" && (
        <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-1">Cycle Count & Stock Take</h3>
          <p className="text-xs text-slate-500 mb-4">
            Count physical shelf inventory and enter the number. The ledger will automatically calculate variance and reconcile.
          </p>

          <form onSubmit={handleStockTake} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700">Product Variant to Audit *</label>
              <select
                required
                value={takeVariantId}
                onChange={(e) => {
                  setTakeVariantId(e.target.value);
                  const item = stockItems.find((s) => s.variant_id === e.target.value);
                  if (item) setTakeCountedQty(item.current_stock.toString());
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
              >
                <option value="">-- Select Variant --</option>
                {stockItems.map((s) => (
                  <option key={`${s.variant_id}-${s.location_id}`} value={s.variant_id}>
                    {s.product_name} - {s.variant_name} ({s.sku}) [System Stock: {s.current_stock}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700">Physical Counted Quantity *</label>
              <input
                type="number"
                min={0}
                required
                value={takeCountedQty}
                onChange={(e) => setTakeCountedQty(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-lg focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {takeVariantId && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex items-center justify-between">
                <span className="text-slate-600 font-medium">Reconciling Discrepancy (Delta):</span>
                <span className="font-bold text-sm font-mono">
                  {parseInt(takeCountedQty, 10) -
                    (stockItems.find((s) => s.variant_id === takeVariantId)?.current_stock || 0)}{" "}
                  units
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={isStockTaking}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {isStockTaking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Reconciling...</span>
                </>
              ) : (
                <span>Reconcile Count Directly to Ledger</span>
              )}
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: BRANCH TRANSFER */}
      {activeTab === "transfer" && (
        <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-1">Inter-Branch Stock Transfer</h3>
          <p className="text-xs text-slate-500 mb-4">
            Move inventory between stores. Creates paired atomic transfer_out and transfer_in ledger movements.
          </p>

          <form onSubmit={handleTransfer} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700">Product Variant *</label>
              <select
                required
                value={trVariantId}
                onChange={(e) => setTrVariantId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
              >
                <option value="">-- Select Variant --</option>
                {stockItems.map((s) => (
                  <option key={`${s.variant_id}-${s.location_id}`} value={s.variant_id}>
                    {s.product_name} - {s.variant_name} ({s.sku}) [Available: {s.current_stock}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700">Transfer Quantity *</label>
              <input
                type="number"
                min={1}
                required
                value={trQuantity}
                onChange={(e) => setTrQuantity(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isTransferring}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {isTransferring ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Transferring...</span>
                </>
              ) : (
                <span>Execute Branch Transfer</span>
              )}
            </button>
          </form>
        </div>
      )}

      {/* TAB 6: SERIAL NUMBER TRACKING */}
      {activeTab === "serials" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={serialSearch}
              onChange={(e) => setSerialSearch(e.target.value)}
              placeholder="Search by serial number..."
              className="rounded-lg border border-slate-300 py-2 px-3 text-xs w-72 focus:border-emerald-500 focus:outline-none"
            />
            <span className="text-xs text-slate-500">{serialsList.length} serials found</span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-4">Serial Number</th>
                  <th className="py-2.5 px-4">Item & Variant</th>
                  <th className="py-2.5 px-4">Current Location</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Warranty</th>
                  <th className="py-2.5 px-4">Sales Invariant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {serialsList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No serial numbers found.
                    </td>
                  </tr>
                ) : (
                  serialsList.map((sn) => (
                    <tr key={sn.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {sn.serial_number}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800">
                          {sn.product_variants.products.name}
                        </span>
                        <span className="text-slate-500 block text-[11px]">
                          {sn.product_variants.name} ({sn.product_variants.sku})
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-600">
                        {sn.stock_locations.stores.name}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            sn.status === "available"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : sn.status === "sold"
                              ? "bg-slate-100 text-slate-700 border border-slate-200"
                              : "bg-purple-50 text-purple-700 border border-purple-200"
                          }`}
                        >
                          {sn.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-1 text-slate-600">
                          <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
                          <span>{sn.warranty_months} months</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        Times sold: {sn.times_sold} (Single-Sale DB Locked)
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
