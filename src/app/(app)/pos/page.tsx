"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTenant } from "@/context/tenant-context";
import { useCartStore, PosVariant } from "@/lib/pos/cart-store";
import { formatBDT } from "@/lib/money";
import {
  Search,
  Barcode,
  Camera,
  Plus,
  Minus,
  Trash2,
  Percent,
  Hash,
  PauseCircle,
  CreditCard,
  UserPlus,
  RotateCcw,
  Ban,
  CheckCircle2,
  AlertCircle,
  Boxes,
  HelpCircle,
  X,
} from "lucide-react";
import { BarcodeListener } from "@/components/pos/barcode-listener";
import { CameraScannerModal } from "@/components/pos/camera-scanner-modal";
import { PaymentModal } from "@/components/pos/payment-modal";
import { SerialSelectModal } from "@/components/pos/serial-select-modal";
import { CustomerModal } from "@/components/pos/customer-modal";
import { HeldCartsModal } from "@/components/pos/held-carts-modal";
import { ReceiptModal } from "@/components/pos/receipt-modal";
import { ReturnModal } from "@/components/pos/return-modal";
import { VoidModal } from "@/components/pos/void-modal";
import { PermissionGuard } from "@/components/ui/permission-guard";
import { SyncStatusBadge } from "@/components/pos/sync-status-badge";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { getOfflineDB } from "@/lib/offline/db";
import { CashDrawerModal } from "@/components/pos/cash-drawer-modal";

export default function PosTerminalPage() {
  const { activeTenant, currentRole } = useTenant();
  const {
    items,
    selectedCustomer,
    heldCarts,
    cartDiscountType,
    cartDiscountValue,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    setCartDiscount,
    setLineDiscount,
    holdCurrentCart,
    getTotals,
    setUserRole,
  } = useCartStore();

  // Active Store & Location IDs
  const tenantId = activeTenant?.id || "";
  const [storeId, setStoreId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");

  // Catalog State
  const [catalog, setCatalog] = useState<PosVariant[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

  // Modals state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isCustomerOpen, setIsCustomerOpen] = useState(false);
  const [isHeldCartsOpen, setIsHeldCartsOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [isShiftOpen, setIsShiftOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Record<string, unknown> | null>(null);

  // Serial selector state
  const [serialModalData, setSerialModalData] = useState<{
    variantId: string;
    productName: string;
    quantity: number;
  } | null>(null);

  // Barcode input ref for keyboard shortcut F2
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [barcodeToast, setBarcodeToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Keep store's userRole synchronized
  useEffect(() => {
    if (currentRole) {
      setUserRole(currentRole);
    }
  }, [currentRole, setUserRole]);

  // Load store, stock location, and catalog
  useEffect(() => {
    if (!tenantId) return;

    // Load locations and catalog in parallel
    Promise.all([
      fetch(`/api/catalog/products?tenantId=${tenantId}&limit=100`).then((res) => res.json()),
      fetch(`/api/catalog/categories?tenantId=${tenantId}`).then((res) => res.json()),
      fetch(`/api/inventory/stock?tenantId=${tenantId}`).then((res) => res.json()),
    ])
      .then(([productsRes, categoriesRes, stockRes]) => {
        if (stockRes.locations && stockRes.locations.length > 0) {
          setLocationId(stockRes.locations[0].id);
          setStoreId(stockRes.locations[0].store_id);
        }

        if (categoriesRes.categories) {
          setCategories(categoriesRes.categories);
        }

        if (productsRes.products) {
          const variantsList: PosVariant[] = [];
          productsRes.products.forEach((p: any) => {
            (p.product_variants || []).forEach((v: any) => {
              variantsList.push({
                id: v.id,
                productId: p.id,
                productName: p.name,
                variantName: v.name,
                sku: v.sku,
                barcode: v.barcode,
                retailPricePoisha: v.retail_price,
                costPricePoisha: v.cost_price,
                taxRateBasisPoints: v.tax_rate,
                hasSerials: p.has_serials,
                categoryId: p.category_id,
                warrantyMonths: p.warranty_months,
                currentStock: v.current_stock || 0,
              });
            });
          });
          setCatalog(variantsList);

          // Cache in Dexie for offline operation
          try {
            const db = getOfflineDB(tenantId);
            const offlineVariants = variantsList.map((v) => ({
              id: v.id,
              productId: v.productId,
              name: v.variantName,
              sku: v.sku,
              barcode: v.barcode,
              retailPrice: v.retailPricePoisha,
              costPrice: v.costPricePoisha,
              taxRate: v.taxRateBasisPoints,
              currentStock: v.currentStock,
              version: 1,
              updatedAt: new Date().toISOString(),
            }));
            const offlineProducts = productsRes.products.map((p: any) => ({
              id: p.id,
              tenantId,
              categoryId: p.category_id,
              brandId: p.brand_id,
              name: p.name,
              unit: p.unit,
              hasVariants: p.has_variants,
              hasSerials: p.has_serials,
              warrantyMonths: p.warranty_months,
              version: 1,
              updatedAt: new Date().toISOString(),
            }));
            db.products.bulkPut(offlineProducts).catch(() => {});
            db.variants.bulkPut(offlineVariants).catch(() => {});
          } catch {}
        }
      })
      .catch(async (err) => {
        console.warn("Online catalog fetch failed, falling back to local Dexie cache:", err);
        try {
          const db = getOfflineDB(tenantId);
          const localProducts = await db.products.toArray();
          const localVariants = await db.variants.toArray();
          const localCategories = await db.categories.toArray();

          if (localCategories.length > 0) {
            setCategories(localCategories.map((c) => ({ id: c.id, name: c.name })));
          }

          if (localVariants.length > 0) {
            const productMap = new Map(localProducts.map((p) => [p.id, p]));
            const variantsList: PosVariant[] = localVariants.map((v) => {
              const p = productMap.get(v.productId);
              return {
                id: v.id,
                productId: v.productId,
                productName: p?.name || v.name,
                variantName: v.name,
                sku: v.sku,
                barcode: v.barcode,
                retailPricePoisha: v.retailPrice,
                costPricePoisha: v.costPrice,
                taxRateBasisPoints: v.taxRate,
                hasSerials: p?.hasSerials || false,
                categoryId: p?.categoryId || null,
                warrantyMonths: p?.warrantyMonths || 0,
                currentStock: v.currentStock,
              };
            });
            setCatalog(variantsList);
          }
        } catch (dbErr) {
          console.error("Dexie offline catalog read error:", dbErr);
        }
      })
      .finally(() => setIsLoadingCatalog(false));
  }, [tenantId]);

  // Fast lookup Map for instant barcode resolution (< 1ms)
  const catalogMap = useMemo(() => {
    const map = new Map<string, PosVariant>();
    catalog.forEach((item) => {
      if (item.barcode) map.set(item.barcode.trim(), item);
      if (item.sku) map.set(item.sku.trim(), item);
      map.set(item.id, item);
    });
    return map;
  }, [catalog]);

  // Filtered catalog tiles
  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      const matchesCategory =
        selectedCategory === "all" || item.categoryId === selectedCategory;

      const matchesSearch =
        searchQuery.trim() === "" ||
        item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.barcode && item.barcode.includes(searchQuery.trim()));

      return matchesCategory && matchesSearch;
    });
  }, [catalog, searchQuery, selectedCategory]);

  // Toast auto-clear
  useEffect(() => {
    if (barcodeToast) {
      const timer = setTimeout(() => setBarcodeToast(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [barcodeToast]);

  const handleBarcodeScanned = useCallback((barcode: string, found: boolean) => {
    if (found) {
      setBarcodeToast({ msg: `Scanned & added: ${barcode}`, type: "success" });
    } else {
      setBarcodeToast({ msg: `Barcode not found: ${barcode}`, type: "error" });
    }
  }, []);

  // Keyboard Shortcuts Handler: F2, F4, F8, F9, Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2: Focus Search Bar
      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      // F4: Pay Checkout Modal
      else if (e.key === "F4") {
        e.preventDefault();
        if (items.length > 0) {
          setIsPaymentOpen(true);
        }
      }
      // F8: Hold Current Cart
      else if (e.key === "F8") {
        e.preventDefault();
        if (items.length > 0) {
          const holdId = holdCurrentCart();
          if (holdId) {
            setBarcodeToast({ msg: "Cart held successfully", type: "success" });
          }
        }
      }
      // F9: Open Held Carts List
      else if (e.key === "F9") {
        e.preventDefault();
        setIsHeldCartsOpen(true);
      }
      // Esc: Close open modals
      else if (e.key === "Escape") {
        setIsCameraOpen(false);
        setIsPaymentOpen(false);
        setIsCustomerOpen(false);
        setIsHeldCartsOpen(false);
        setIsReturnOpen(false);
        setIsVoidOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [items.length, holdCurrentCart]);

  const totals = getTotals();

  const handleAddItem = (variant: PosVariant) => {
    addItem(variant, 1);
    // If serialized item, immediately prompt for serial
    if (variant.hasSerials) {
      const existing = items.find((i) => i.variantId === variant.id);
      const newQty = (existing?.quantity || 0) + 1;
      setSerialModalData({
        variantId: variant.id,
        productName: variant.productName,
        quantity: newQty,
      });
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-100 overflow-hidden select-none">
      {/* Universal Scanner Listener */}
      <BarcodeListener catalogMap={catalogMap} onScanned={handleBarcodeScanned} />

      {/* POS Top Control Bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-2.5 shrink-0 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              {activeTenant?.name || "Main Terminal"}
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 border-l border-slate-200 pl-4">
            <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-medium text-slate-700">Shortcuts:</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 font-mono text-[10px] border border-slate-300">F2 Search</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 font-mono text-[10px] border border-slate-300">F4 Pay</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 font-mono text-[10px] border border-slate-300">F8 Hold</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 font-mono text-[10px] border border-slate-300">F9 Res</span>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          <SyncStatusBadge tenantId={tenantId} storeId={storeId} />

          <button
            type="button"
            onClick={() => setIsReturnOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
            <span>Return</span>
          </button>

          <PermissionGuard action="void:sale">
            <button
              type="button"
              onClick={() => setIsVoidOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
            >
              <Ban className="h-3.5 w-3.5 text-rose-600" />
              <span>Void Sale</span>
            </button>
          </PermissionGuard>

          <button
            type="button"
            onClick={() => setIsShiftOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
          >
            <Boxes className="h-3.5 w-3.5 text-emerald-600" />
            <span>Cash Shift</span>
          </button>

          <button
            type="button"
            onClick={() => setIsHeldCartsOpen(true)}
            className="relative inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            <PauseCircle className="h-3.5 w-3.5 text-amber-600" />
            <span>Held Carts</span>
            {heldCarts.length > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                {heldCarts.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Barcode Feedback Toast */}
      {barcodeToast && (
        <div
          className={`fixed top-16 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold shadow-lg transition ${
            barcodeToast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-rose-600 text-white"
          }`}
        >
          {barcodeToast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span>{barcodeToast.msg}</span>
        </div>
      )}

      {/* Main Terminal Split View */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Product Search, Barcode Input, & Quick Tiles */}
        <div className="flex flex-col flex-1 border-r border-slate-200 bg-slate-50 p-4 overflow-hidden">
          {/* Barcode & Search Controls Bar */}
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                data-barcode-capture="true"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Scan barcode or search product (F2)..."
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
              title="Scan with Camera"
            >
              <Camera className="h-4 w-4 text-emerald-600" />
              <span className="hidden sm:inline">Camera</span>
            </button>
          </div>

          {/* Category Filter Pills */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-1 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold shrink-0 transition ${
                  selectedCategory === "all"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold shrink-0 transition ${
                    selectedCategory === cat.id
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Quick Add Product Tiles Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            {isLoadingCatalog ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse p-4" />
                ))}
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-center">
                <Boxes className="h-10 w-10 text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-600">No matching products found</p>
                <p className="text-xs text-slate-400 mt-1">Try searching by SKU or scan another barcode.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredCatalog.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => handleAddItem(variant)}
                    className="flex flex-col justify-between p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-emerald-500 hover:shadow-md transition text-left group active:scale-[0.98]"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <p className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 line-clamp-2">
                          {variant.productName}
                        </p>
                        {variant.hasSerials && (
                          <span className="shrink-0 rounded bg-indigo-50 px-1 py-0.5 text-[9px] font-bold text-indigo-700 border border-indigo-200">
                            SN
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{variant.sku}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                      <span className="text-sm font-extrabold text-slate-900">
                        {formatBDT(variant.retailPricePoisha)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        Stock: {variant.currentStock}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Active Cart & Checkout Panel */}
        <div className="flex flex-col w-full max-w-md lg:max-w-lg bg-white shadow-xl overflow-hidden shrink-0">
          {/* Customer Association Bar */}
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
            <button
              type="button"
              onClick={() => setIsCustomerOpen(true)}
              className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-emerald-700 transition"
            >
              <UserPlus className="h-4 w-4 text-emerald-600" />
              <span>
                {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.phone})` : "Attach Customer (Walk-in)"}
              </span>
            </button>
            {selectedCustomer && (
              <span className="text-[11px] font-bold text-amber-700">
                Due: {formatBDT(selectedCustomer.currentDue)}
              </span>
            )}
          </div>

          {/* Cart Items Table */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 py-16 text-center">
                <Barcode className="h-12 w-12 text-slate-300 mb-2 stroke-1" />
                <p className="text-sm font-bold text-slate-600">Cart is Empty</p>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Scan barcode with your scanner or click any product tile on the left to add items.
                </p>
              </div>
            ) : (
              items.map((item) => {
                const isSerialMissing =
                  item.hasSerials && item.selectedSerials.length !== item.quantity;

                return (
                  <div key={item.variantId} className="p-3 rounded-xl hover:bg-slate-50 transition space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{item.productName}</p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {formatBDT(item.unitPricePoisha)} each
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-extrabold text-slate-900">
                          {formatBDT(item.unitPricePoisha * item.quantity)}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeItem(item.variantId)}
                          className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Quantity & Serial Controls */}
                    <div className="flex items-center justify-between pt-1">
                      {/* Quantity Incrementor */}
                      <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                          className="p-1 hover:bg-slate-100 text-slate-600"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateQuantity(item.variantId, parseInt(e.target.value) || 1)
                          }
                          className="w-10 text-center text-xs font-bold focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                          className="p-1 hover:bg-slate-100 text-slate-600"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Line Discount Control */}
                      <div className="flex items-center gap-1">
                        <select
                          value={item.discountType}
                          onChange={(e) =>
                            setLineDiscount(
                              item.variantId,
                              e.target.value as "none" | "percent" | "fixed",
                              item.discountValue
                            )
                          }
                          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 focus:outline-none"
                        >
                          <option value="none">0%</option>
                          <option value="percent">% Off</option>
                          <option value="fixed">৳ Off</option>
                        </select>
                        {item.discountType !== "none" && (
                          <input
                            type="number"
                            min="0"
                            value={
                              item.discountType === "fixed"
                                ? item.discountValue / 100
                                : item.discountValue
                            }
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setLineDiscount(
                                item.variantId,
                                item.discountType,
                                item.discountType === "fixed"
                                  ? Math.round(val * 100)
                                  : val
                              );
                            }}
                            className="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 text-right text-[10px] font-bold focus:outline-none"
                          />
                        )}
                      </div>

                      {/* Serial Tag Button if Serialized */}
                      {item.hasSerials && (
                        <button
                          type="button"
                          onClick={() =>
                            setSerialModalData({
                              variantId: item.variantId,
                              productName: item.productName,
                              quantity: item.quantity,
                            })
                          }
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold border ${
                            isSerialMissing
                              ? "border-rose-300 bg-rose-50 text-rose-700 animate-pulse"
                              : "border-emerald-300 bg-emerald-50 text-emerald-800"
                          }`}
                        >
                          <Hash className="h-3 w-3" />
                          <span>
                            {isSerialMissing
                              ? `Select Serials (${item.selectedSerials.length}/${item.quantity})`
                              : `Serials Assigned (${item.selectedSerials.length})`}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Cart Bottom Summary & Checkout Actions */}
          <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-3">
            {/* Whole Cart Discount Row */}
            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-200">
              <span className="flex items-center gap-1 text-slate-600 font-medium">
                <Percent className="h-3.5 w-3.5 text-emerald-600" />
                Cart Discount
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  value={cartDiscountType}
                  onChange={(e) =>
                    setCartDiscount(
                      e.target.value as "none" | "percent" | "fixed",
                      cartDiscountValue
                    )
                  }
                  className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none"
                >
                  <option value="none">None</option>
                  <option value="percent">% Discount</option>
                  <option value="fixed">৳ Flat</option>
                </select>
                {cartDiscountType !== "none" && (
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={
                      cartDiscountType === "fixed"
                        ? cartDiscountValue / 100
                        : cartDiscountValue
                    }
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setCartDiscount(
                        cartDiscountType,
                        cartDiscountType === "fixed"
                          ? Math.round(val * 100)
                          : val
                      );
                    }}
                    className="w-16 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-right text-xs font-bold text-slate-900 focus:outline-none"
                  />
                )}
              </div>
            </div>
            {/* Subtotal, Discounts, Tax */}
            <div className="space-y-1 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-800">{formatBDT(totals.subtotalPoisha)}</span>
              </div>
              {totals.totalDiscountPoisha > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Total Discount</span>
                  <span className="font-semibold">-{formatBDT(totals.totalDiscountPoisha)}</span>
                </div>
              )}
              {totals.totalTaxPoisha > 0 && (
                <div className="flex justify-between">
                  <span>VAT / Tax</span>
                  <span className="font-semibold text-slate-800">+{formatBDT(totals.totalTaxPoisha)}</span>
                </div>
              )}
            </div>

            {/* Total Payable Display */}
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
              <span className="text-sm font-bold text-slate-800">Total Payable</span>
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                {formatBDT(totals.totalAmountPoisha)}
              </span>
            </div>

            {/* Hold Cart & Clear Controls */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const id = holdCurrentCart();
                  if (id) setBarcodeToast({ msg: "Cart held successfully", type: "success" });
                }}
                disabled={items.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition"
              >
                <PauseCircle className="h-4 w-4 text-amber-600" />
                <span>Hold Cart (F8)</span>
              </button>

              <button
                type="button"
                onClick={clearCart}
                disabled={items.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition"
              >
                <Trash2 className="h-4 w-4" />
                <span>Clear Cart</span>
              </button>
            </div>

            {/* Big Checkout Pay Button (F4) */}
            <button
              type="button"
              onClick={() => setIsPaymentOpen(true)}
              disabled={items.length === 0}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-base font-extrabold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-40 transition"
            >
              <CreditCard className="h-5 w-5" />
              <span>PAY {formatBDT(totals.totalAmountPoisha)} (F4)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modals Container */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onDetected={(barcode) => {
          handleBarcodeScanned(barcode, useCartStore.getState().scanBarcode(barcode, catalogMap));
        }}
      />

      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        onSaleCompleted={(sale) => setReceiptSale(sale)}
        tenantId={tenantId}
        storeId={storeId}
        locationId={locationId}
      />

      {serialModalData && (
        <SerialSelectModal
          isOpen={!!serialModalData}
          onClose={() => setSerialModalData(null)}
          variantId={serialModalData.variantId}
          productName={serialModalData.productName}
          requiredQuantity={serialModalData.quantity}
          tenantId={tenantId}
        />
      )}

      <CustomerModal
        isOpen={isCustomerOpen}
        onClose={() => setIsCustomerOpen(false)}
        tenantId={tenantId}
      />

      <HeldCartsModal
        isOpen={isHeldCartsOpen}
        onClose={() => setIsHeldCartsOpen(false)}
      />

      {receiptSale && (
        <ReceiptModal
          isOpen={!!receiptSale}
          onClose={() => setReceiptSale(null)}
          sale={receiptSale}
          storeName={activeTenant?.name}
        />
      )}

      <ReturnModal
        isOpen={isReturnOpen}
        onClose={() => setIsReturnOpen(false)}
        tenantId={tenantId}
        storeId={storeId}
        locationId={locationId}
      />

      <VoidModal
        isOpen={isVoidOpen}
        onClose={() => setIsVoidOpen(false)}
        tenantId={tenantId}
      />

      <CashDrawerModal
        isOpen={isShiftOpen}
        onClose={() => setIsShiftOpen(false)}
        tenantId={tenantId}
        storeId={storeId}
      />

      <PwaRegister />
    </div>
  );
}
