"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/context/tenant-context";
import {
  Plus,
  Upload,
  Download,
  Search,
  Lock,
  Printer,
  ShieldCheck,
  AlertTriangle,
  Boxes,
  Trash2,
} from "lucide-react";
import { formatBDT } from "@/lib/money";
import { CreateProductModal } from "@/components/catalog/create-product-modal";
import { CSVImportModal } from "@/components/catalog/csv-import-modal";
import { BarcodePrintModal } from "@/components/catalog/barcode-print-modal";
import { PermissionGuard } from "@/components/ui/permission-guard";

interface Variant {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  cost_price: number | null;
  retail_price: number;
  wholesale_price: number;
  tax_rate: number;
  reorder_point: number;
  current_stock: number;
  is_low_stock: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  has_variants: boolean;
  has_serials: boolean;
  warranty_months: number;
  is_active: boolean;
  category_id: string | null;
  brand_id: string | null;
  categories: { id: string; name: string; slug: string } | null;
  brands: { id: string; name: string } | null;
  product_variants: Variant[];
}

export default function CatalogPage() {
  const { activeTenant } = useTenant();

  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters & State
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedBarcodeItem, setSelectedBarcodeItem] = useState<{
    id: string;
    productName: string;
    variantName: string;
    sku: string;
    barcode: string;
    retailPrice: number;
  } | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!activeTenant) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        tenantId: activeTenant.id,
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/catalog/products?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setProducts(json.products || []);
        setTotalCount(json.totalCount || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [activeTenant, page, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!activeTenant) return;
    if (!confirm(`Are you sure you want to archive product "${name}"?`)) return;

    try {
      const res = await fetch(`/api/catalog/products/${id}?tenantId=${activeTenant.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchProducts();
      }
    } catch (err) {
      console.error("Failed to delete product", err);
    }
  };

  const handleExportCSV = () => {
    if (!activeTenant) return;
    window.location.href = `/api/catalog/export?tenantId=${activeTenant.id}`;
  };

  // Filter products by stock status client-side
  const filteredProducts = products.filter((p) => {
    if (statusFilter === "all") return true;
    const totalStock = p.product_variants.reduce((acc, v) => acc + (v.current_stock || 0), 0);
    const hasLowStock = p.product_variants.some((v) => v.is_low_stock && v.current_stock > 0);

    if (statusFilter === "in_stock") return totalStock > 0;
    if (statusFilter === "low_stock") return hasLowStock;
    if (statusFilter === "out_of_stock") return totalStock <= 0;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Catalog & Products
          </h1>
          <p className="text-sm text-slate-500">
            Manage store catalog, variants, prices, barcodes, and serial warranties
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <PermissionGuard action="manage:catalog">
            <button
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import CSV</span>
            </button>
          </PermissionGuard>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>

          <PermissionGuard action="manage:catalog">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>New Product</span>
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 border-b sm:border-b-0 border-slate-200 pb-2 sm:pb-0">
            {(
              [
                { id: "all", label: "All Items" },
                { id: "in_stock", label: "In Stock" },
                { id: "low_stock", label: "Low Stock Alert" },
                { id: "out_of_stock", label: "Out of Stock" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === tab.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, SKU..."
              className="w-full rounded-lg border border-slate-300 py-1.5 pl-9 pr-3 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Products Data Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mb-2" />
            <p>Loading catalog items...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
              <Boxes className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No products found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {search
                ? `No products match your search query "${search}".`
                : "Get started by adding your first product or importing products via CSV."}
            </p>
            <PermissionGuard action="manage:catalog">
              <button
                onClick={() => setIsCreateOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
              >
                <Plus className="h-4 w-4" />
                <span>Create Product</span>
              </button>
            </PermissionGuard>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Variants & SKU</th>
                  <th className="py-3 px-4">Retail Price</th>
                  <th className="py-3 px-4">Cost Price (COGS)</th>
                  <th className="py-3 px-4">Stock on Hand</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50/75 transition">
                    {/* Product Name & Tags */}
                    <td className="py-4 px-4 align-top">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 font-bold text-xs uppercase">
                          {product.name.slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{product.name}</span>
                            {product.has_serials && (
                              <span className="flex items-center gap-1 rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 border border-purple-200">
                                <ShieldCheck className="h-3 w-3" />
                                <span>{product.warranty_months}m warranty</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                            {product.categories && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                                {product.categories.name}
                              </span>
                            )}
                            {product.brands && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                                {product.brands.name}
                              </span>
                            )}
                            <span>Unit: {product.unit}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Variants List */}
                    <td className="py-4 px-4 align-top">
                      <div className="space-y-1.5">
                        {product.product_variants.map((v) => (
                          <div key={v.id} className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-slate-800">{v.name}:</span>
                            <span className="font-mono text-slate-500">{v.sku}</span>
                            {v.barcode && (
                              <button
                                onClick={() =>
                                  setSelectedBarcodeItem({
                                    id: v.id,
                                    productName: product.name,
                                    variantName: v.name,
                                    sku: v.sku,
                                    barcode: v.barcode!,
                                    retailPrice: v.retail_price,
                                  })
                                }
                                title="Print Barcode Label"
                                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Retail Price */}
                    <td className="py-4 px-4 align-top">
                      <div className="space-y-1 text-xs">
                        {product.product_variants.map((v) => (
                          <div key={v.id} className="font-bold text-slate-900">
                            {formatBDT(v.retail_price)}
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Cost Price: Masked for cashiers */}
                    <td className="py-4 px-4 align-top">
                      <div className="space-y-1 text-xs">
                        {product.product_variants.map((v) => (
                          <div key={v.id}>
                            {v.cost_price === null ? (
                              <span className="flex items-center gap-1 text-slate-400 font-mono text-[11px]">
                                <Lock className="h-3 w-3" />
                                <span>Hidden</span>
                              </span>
                            ) : (
                              <span className="font-mono text-slate-600">
                                {formatBDT(v.cost_price)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Stock on Hand (Derived from ledger) */}
                    <td className="py-4 px-4 align-top">
                      <div className="space-y-1.5 text-xs">
                        {product.product_variants.map((v) => (
                          <div key={v.id} className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {v.current_stock} {product.unit}
                            </span>
                            {v.current_stock <= 0 ? (
                              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                                Out of Stock
                              </span>
                            ) : v.is_low_stock ? (
                              <span className="flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                <span>Low ({v.current_stock})</span>
                              </span>
                            ) : (
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                In Stock
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4 text-right align-top">
                      <PermissionGuard action="manage:catalog">
                        <button
                          onClick={() => handleDeleteProduct(product.id, product.name)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Archive Product"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </PermissionGuard>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalCount > pageSize && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50/50 text-xs">
            <span className="text-slate-500">
              Showing {(page - 1) * pageSize + 1} to{" "}
              {Math.min(page * pageSize, totalCount)} of {totalCount} items
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page * pageSize >= totalCount}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {activeTenant && (
        <>
          <CreateProductModal
            isOpen={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            tenantId={activeTenant.id}
            onSuccess={fetchProducts}
          />

          <CSVImportModal
            isOpen={isImportOpen}
            onClose={() => setIsImportOpen(false)}
            tenantId={activeTenant.id}
            onImportSuccess={fetchProducts}
          />

          <BarcodePrintModal
            isOpen={Boolean(selectedBarcodeItem)}
            onClose={() => setSelectedBarcodeItem(null)}
            item={selectedBarcodeItem}
          />
        </>
      )}
    </div>
  );
}
