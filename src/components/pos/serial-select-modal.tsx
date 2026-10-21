"use client";

import React, { useState, useEffect } from "react";
import { X, Hash, Check, Search, AlertCircle } from "lucide-react";
import { useCartStore } from "@/lib/pos/cart-store";

interface SerialSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  variantId: string;
  productName: string;
  requiredQuantity: number;
  tenantId: string;
}

export function SerialSelectModal({
  isOpen,
  onClose,
  variantId,
  productName,
  requiredQuantity,
  tenantId,
}: SerialSelectModalProps) {
  const { items, setLineSerials } = useCartStore();
  const currentItem = items.find((i) => i.variantId === variantId);

  const [availableSerials, setAvailableSerials] = useState<Array<{ id: string; serial_number: string }>>([]);
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [quickInput, setQuickInput] = useState("");

  useEffect(() => {
    if (!isOpen || !variantId) return;

    setSelectedSerials(currentItem?.selectedSerials || []);
    setIsLoading(true);

    fetch(`/api/pos/serials?tenantId=${tenantId}&variantId=${variantId}`)
      .then((res) => res.json())
      .then((data) => {
        setAvailableSerials(data.serials || []);
      })
      .catch((err) => console.error("Failed to load serials:", err))
      .finally(() => setIsLoading(false));
  }, [isOpen, variantId, tenantId, currentItem?.selectedSerials]);

  if (!isOpen) return null;

  const toggleSerial = (sn: string) => {
    if (selectedSerials.includes(sn)) {
      setSelectedSerials(selectedSerials.filter((s) => s !== sn));
    } else {
      if (selectedSerials.length >= requiredQuantity) return;
      setSelectedSerials([...selectedSerials, sn]);
    }
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const sn = quickInput.trim();
    if (!sn) return;

    const matched = availableSerials.find(
      (s) => s.serial_number.toLowerCase() === sn.toLowerCase()
    );

    if (matched && !selectedSerials.includes(matched.serial_number)) {
      if (selectedSerials.length < requiredQuantity) {
        setSelectedSerials([...selectedSerials, matched.serial_number]);
        setQuickInput("");
      }
    }
  };

  const handleConfirm = () => {
    setLineSerials(variantId, selectedSerials);
    onClose();
  };

  const filteredSerials = availableSerials.filter((s) =>
    s.serial_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isComplete = selectedSerials.length === requiredQuantity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-emerald-600" />
              <h3 className="font-bold text-slate-900 text-lg">Select Serial Numbers</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {productName} • Required:{" "}
              <span className="font-semibold text-slate-800">{requiredQuantity}</span> units
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Quick scan or type input */}
          <form onSubmit={handleQuickAdd} className="flex gap-2">
            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder="Scan or type serial number..."
              className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!quickInput.trim() || selectedSerials.length >= requiredQuantity}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 transition"
            >
              Add
            </button>
          </form>

          {/* Search filter */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter available serials..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Counter Status */}
          <div
            className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold ${
              isComplete
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {isComplete ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600" />
              )}
              <span>
                Selected {selectedSerials.length} of {requiredQuantity} serial(s)
              </span>
            </div>
            {selectedSerials.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedSerials([])}
                className="text-xs text-slate-500 hover:text-slate-800 underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Serials List */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {isLoading ? (
              <p className="text-xs text-center py-6 text-slate-400">Loading available serials...</p>
            ) : filteredSerials.length === 0 ? (
              <p className="text-xs text-center py-6 text-slate-400">No matching available serials found.</p>
            ) : (
              filteredSerials.map((s) => {
                const isSelected = selectedSerials.includes(s.serial_number);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSerial(s.serial_number)}
                    disabled={!isSelected && selectedSerials.length >= requiredQuantity}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg text-xs font-medium transition ${
                      isSelected
                        ? "bg-emerald-600 text-white font-semibold shadow-xs"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-800 disabled:opacity-40"
                    }`}
                  >
                    <span>{s.serial_number}</span>
                    {isSelected && <Check className="h-4 w-4 text-white" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-3.5 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isComplete}
            className="rounded-xl bg-emerald-600 px-6 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition shadow-xs"
          >
            Confirm Serials ({selectedSerials.length}/{requiredQuantity})
          </button>
        </div>
      </div>
    </div>
  );
}
