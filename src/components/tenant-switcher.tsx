"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTenant } from "@/context/tenant-context";
import { Store, ChevronDown, Check, Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export function TenantSwitcher() {
  const { memberships, activeTenant, currentRole, switchTenant } = useTenant();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!activeTenant) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        aria-label="Switch store tenant"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
          <Store className="h-4 w-4" />
        </div>
        <div className="flex flex-col">
          <span className="truncate max-w-[140px] font-semibold text-slate-900 leading-tight">
            {activeTenant.name}
          </span>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
            {currentRole}
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
            Switch Store Outlet
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {memberships.map((m) => {
              const isSelected = m.tenant.id === activeTenant.id;
              return (
                <button
                  key={m.tenant.id}
                  onClick={() => {
                    switchTenant(m.tenant.id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                    isSelected ? "bg-emerald-50/60 text-emerald-950 font-medium" : "text-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Store className={`h-4 w-4 shrink-0 ${isSelected ? "text-emerald-600" : "text-slate-400"}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{m.tenant.name}</p>
                      <Badge variant="default" className="text-[9px] px-1.5 py-0 mt-0.5">
                        {m.role}
                      </Badge>
                    </div>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-100 pt-1 mt-1">
            <Link
              href="/onboarding"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition rounded-b-lg"
            >
              <Plus className="h-4 w-4" />
              <span>Create New Store</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
