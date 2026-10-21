"use client";

import React from "react";
import { X, PauseCircle, Play, Trash2, ShoppingBag, Clock } from "lucide-react";
import { useCartStore, HeldCart } from "@/lib/pos/cart-store";
import { formatBDT } from "@/lib/money";

interface HeldCartsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HeldCartsModal({ isOpen, onClose }: HeldCartsModalProps) {
  const { heldCarts, resumeHeldCart, discardHeldCart } = useCartStore();

  if (!isOpen) return null;

  const handleResume = (id: string) => {
    resumeHeldCart(id);
    onClose();
  };

  const formatElapsed = (timestamp: number) => {
    const diffSecs = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSecs < 60) return "Just now";
    const mins = Math.floor(diffSecs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-amber-600" />
            <h3 className="font-bold text-slate-900 text-lg">Held Carts ({heldCarts.length})</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* List of Held Carts */}
        <div className="p-6 overflow-y-auto space-y-3">
          {heldCarts.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <ShoppingBag className="mx-auto h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">No carts currently on hold</p>
              <p className="text-xs text-slate-400">
                Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-slate-700">F8</kbd> or click &quot;Hold Cart&quot; to save an in-progress transaction.
              </p>
            </div>
          ) : (
            heldCarts.map((cart: HeldCart) => {
              const totalItems = cart.items.reduce((acc, i) => acc + i.quantity, 0);
              const estSubtotal = cart.items.reduce((acc, i) => acc + i.unitPricePoisha * i.quantity, 0);

              return (
                <div
                  key={cart.id}
                  className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-emerald-300 transition shadow-xs"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">{cart.name}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatElapsed(cart.timestamp)}
                      </span>
                      <span>•</span>
                      <span>{totalItems} items</span>
                      <span>•</span>
                      <span className="font-semibold text-emerald-700">{formatBDT(estSubtotal)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => discardHeldCart(cart.id)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                      title="Discard Cart"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResume(cart.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Resume</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-3.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
