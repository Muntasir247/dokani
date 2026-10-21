"use client";

import React from "react";
import { useTenant } from "@/context/tenant-context";
import { ShoppingCart } from "lucide-react";

export default function PosTerminalPage() {
  const { activeTenant, currentRole } = useTenant();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">POS Checkout Terminal</h1>
          <p className="text-sm text-slate-500">
            {activeTenant?.name} • Logged in as <span className="font-semibold uppercase">{currentRole}</span>
          </p>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
        <ShoppingCart className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-4 text-base font-semibold text-slate-700">Offline-First POS Terminal</h3>
        <p className="mt-1 text-sm text-slate-500">
          Terminal UI and Dexie offline engine will be activated in Step 6 & 7.
        </p>
      </div>
    </div>
  );
}
