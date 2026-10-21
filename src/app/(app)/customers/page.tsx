"use client";

import React from "react";
import { useTenant } from "@/context/tenant-context";
import { Users } from "lucide-react";

export default function CustomersPage() {
  const { activeTenant } = useTenant();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customers & Dues</h1>
          <p className="text-sm text-slate-500">Customer directory and credit ledger for {activeTenant?.name}</p>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
        <Users className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-4 text-base font-semibold text-slate-700">Customer Directory</h3>
        <p className="mt-1 text-sm text-slate-500">
          Customer balance tracking and khata will be fleshed out in Step 9.
        </p>
      </div>
    </div>
  );
}
