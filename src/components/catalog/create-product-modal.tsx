"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, Sparkles, Trash2, Loader2, Barcode as BarcodeIcon, ShieldAlert } from "lucide-react";
import { toPoisha } from "@/lib/money";
import { generateInternalEAN13, generateSKU } from "@/lib/barcodes";
import { parseBulkSerials } from "@/lib/inventory/serials";

interface CreateProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onSuccess: () => void;
}

interface VariantInput {
  name: string;
  sku: string;
  barcode: string;
  costPriceBDT: string;
  retailPriceBDT: string;
  taxRate: string;
  reorderPoint: string;
  openingStock: string;
  serialsRaw: string;
}

export function CreateProductModal({
  isOpen,
  onClose,
  tenantId,
  onSuccess,
}: CreateProductModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [hasVariants, setHasVariants] = useState(false);
  const [hasSerials, setHasSerials] = useState(false);
  const [warrantyMonths, setWarrantyMonths] = useState(0);

  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);

  const [variants, setVariants] = useState<VariantInput[]>([
    {
      name: "Standard",
      sku: generateSKU("DOK"),
      barcode: generateInternalEAN13(),
      costPriceBDT: "100.00",
      retailPriceBDT: "150.00",
      taxRate: "0",
      reorderPoint: "5",
      openingStock: "10",
      serialsRaw: "",
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Load categories & brands for selector dropdowns
    const loadMetadata = async () => {
      try {
        const [catRes, brandRes] = await Promise.all([
          fetch(`/api/catalog/categories?tenantId=${tenantId}`),
          fetch(`/api/catalog/brands?tenantId=${tenantId}`),
        ]);
        if (catRes.ok) {
          const json = await catRes.json();
          setCategories(json.categories || []);
        }
        if (brandRes.ok) {
          const json = await brandRes.json();
          setBrands(json.brands || []);
        }
      } catch (err) {
        console.error("Failed to load catalog metadata", err);
      }
    };

    loadMetadata();
  }, [isOpen, tenantId]);

  if (!isOpen) return null;

  const handleAddVariant = () => {
    setVariants((prev) => [
      ...prev,
      {
        name: `Variant ${prev.length + 1}`,
        sku: generateSKU("DOK"),
        barcode: generateInternalEAN13(),
        costPriceBDT: "100.00",
        retailPriceBDT: "150.00",
        taxRate: "0",
        reorderPoint: "5",
        openingStock: "0",
        serialsRaw: "",
      },
    ]);
  };

  const handleRemoveVariant = (index: number) => {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateVariant = (index: number, field: keyof VariantInput, value: string) => {
    setVariants((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage("Product name is required.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const mappedVariants = variants.map((v) => {
        const costPoisha = toPoisha(parseFloat(v.costPriceBDT) || 0);
        const retailPoisha = toPoisha(parseFloat(v.retailPriceBDT) || 0);
        const parsedSerials = hasSerials ? parseBulkSerials(v.serialsRaw).serials : [];

        return {
          name: v.name,
          sku: v.sku.trim().toUpperCase(),
          barcode: v.barcode.trim() || null,
          cost_price: costPoisha,
          retail_price: retailPoisha,
          wholesale_price: retailPoisha,
          tax_rate: parseFloat(v.taxRate) || 0,
          reorder_point: parseInt(v.reorderPoint, 10) || 5,
          opening_stock: parseInt(v.openingStock, 10) || 0,
          serials: parsedSerials,
        };
      });

      const payload = {
        tenant_id: tenantId,
        category_id: categoryId || null,
        brand_id: brandId || null,
        name: name.trim(),
        description: description.trim() || null,
        unit,
        has_variants: hasVariants,
        has_serials: hasSerials,
        warranty_months: hasSerials ? warrantyMonths : 0,
        variants: mappedVariants,
      };

      const res = await fetch("/api/catalog/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        setErrorMessage(json.error || "Failed to create product.");
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setErrorMessage("Network error while creating product.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Add New Product</h3>
            <p className="text-xs text-slate-500">
              Configure product details, variants, prices, and optional serial tracking
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-700">Product Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Anker 737 Power Bank (24000mAh)"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Unit of Measure</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="pcs">Pieces (pcs)</option>
                <option value="kg">Kilograms (kg)</option>
                <option value="g">Grams (g)</option>
                <option value="litre">Litres (L)</option>
                <option value="box">Box</option>
                <option value="set">Set</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="">-- None / General --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Brand</label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="">-- None / Generic --</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief notes or specs"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Special Toggles */}
          <div className="flex flex-wrap items-center gap-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasVariants}
                onChange={(e) => setHasVariants(e.target.checked)}
                className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-semibold text-slate-800">
                Has Multiple Variants (Size, Color, etc.)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasSerials}
                onChange={(e) => setHasSerials(e.target.checked)}
                className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-semibold text-slate-800">
                Track Serial Numbers per Unit (Electronics/Gadgets)
              </span>
            </label>

            {hasSerials && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 font-medium">Warranty Period:</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(parseInt(e.target.value) || 0)}
                  className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-xs text-slate-500">months</span>
              </div>
            )}
          </div>

          {/* Variants Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Variants & Pricing
              </span>
              {hasVariants && (
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Another Variant</span>
                </button>
              )}
            </div>

            <div className="space-y-4">
              {variants.map((variant, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-800">
                      {hasVariants ? `Variant #${index + 1}` : "Standard Variant"}
                    </span>
                    {hasVariants && variants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(index)}
                        className="text-slate-400 hover:text-rose-500 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">Variant Name</label>
                      <input
                        type="text"
                        required
                        value={variant.name}
                        onChange={(e) => handleUpdateVariant(index, "name", e.target.value)}
                        placeholder="e.g. XL, Black, 128GB"
                        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-slate-600">SKU *</label>
                        <button
                          type="button"
                          onClick={() => handleUpdateVariant(index, "sku", generateSKU("DOK"))}
                          className="text-[10px] text-emerald-600 hover:underline flex items-center gap-0.5"
                        >
                          <Sparkles className="h-2.5 w-2.5" /> auto
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        value={variant.sku}
                        onChange={(e) => handleUpdateVariant(index, "sku", e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono uppercase focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-slate-600">Barcode</label>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateVariant(index, "barcode", generateInternalEAN13())
                          }
                          className="text-[10px] text-emerald-600 hover:underline flex items-center gap-0.5"
                        >
                          <BarcodeIcon className="h-2.5 w-2.5" /> EAN-13
                        </button>
                      </div>
                      <input
                        type="text"
                        value={variant.barcode}
                        onChange={(e) => handleUpdateVariant(index, "barcode", e.target.value)}
                        placeholder="Scan or generate"
                        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">Retail Price (৳)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={variant.retailPriceBDT}
                        onChange={(e) =>
                          handleUpdateVariant(index, "retailPriceBDT", e.target.value)
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">Cost Price (৳)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={variant.costPriceBDT}
                        onChange={(e) => handleUpdateVariant(index, "costPriceBDT", e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">Opening Stock</label>
                      <input
                        type="number"
                        min={0}
                        value={variant.openingStock}
                        onChange={(e) => handleUpdateVariant(index, "openingStock", e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">Reorder Alert Level</label>
                      <input
                        type="number"
                        min={0}
                        value={variant.reorderPoint}
                        onChange={(e) => handleUpdateVariant(index, "reorderPoint", e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">Tax / VAT (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={variant.taxRate}
                        onChange={(e) => handleUpdateVariant(index, "taxRate", e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Serial Numbers Bulk Input */}
                  {hasSerials && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-700">
                          Serial Numbers (Paste or scan comma/newline separated)
                        </label>
                        <span className="text-[10px] text-slate-400">
                          {parseBulkSerials(variant.serialsRaw).serials.length} serials parsed
                        </span>
                      </div>
                      <textarea
                        value={variant.serialsRaw}
                        onChange={(e) =>
                          handleUpdateVariant(index, "serialsRaw", e.target.value)
                        }
                        rows={2}
                        placeholder="SN-1001, SN-1002, SN-1003 or scan barcodes one by one"
                        className="w-full rounded-md border border-slate-300 p-2 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Saving Product...</span>
                </>
              ) : (
                <span>Save Product</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
