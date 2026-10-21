"use client";

import React, { useEffect, useState } from "react";
import { useTenant } from "@/context/tenant-context";
import { Package, Lock } from "lucide-react";
import { formatBDT } from "@/lib/money";

interface Variant {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  cost_price: number | null;
  retail_price: number;
}

interface Product {
  id: string;
  name: string;
  unit: string;
  product_variants: Variant[];
}

export default function CatalogPage() {
  const { activeTenant, currentRole } = useTenant();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!activeTenant) return;
    const fetchProducts = async () => {
      try {
        const res = await fetch(`/api/catalog/products?tenantId=${activeTenant.id}`);
        if (res.ok) {
          const json = await res.json();
          setProducts(json.products || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProducts();
  }, [activeTenant]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Catalog & Products</h1>
        <p className="text-sm text-slate-500">
          Showing items for {activeTenant?.name} (Role: <span className="font-semibold uppercase">{currentRole}</span>)
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading catalog...</div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <Package className="mx-auto h-8 w-8 text-slate-300 mb-2" />
            No products found in this tenant yet.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Product / Variant</th>
                <th className="px-4 py-3">SKU / Barcode</th>
                <th className="px-4 py-3 text-right">Retail Price</th>
                <th className="px-4 py-3 text-right">Cost Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.flatMap((p) =>
                p.product_variants.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {p.name} - <span className="text-slate-500 font-normal">{v.name}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {v.sku} {v.barcode && `(${v.barcode})`}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700">
                      {formatBDT(v.retail_price)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {v.cost_price !== null ? (
                        <span className="font-medium text-slate-700">{formatBDT(v.cost_price)}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-mono italic">
                          <Lock className="h-3 w-3" />
                          <span>Hidden (Cashier)</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
