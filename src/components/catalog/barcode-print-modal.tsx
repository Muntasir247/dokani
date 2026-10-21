"use client";

import React, { useState } from "react";
import { Printer, X } from "lucide-react";
import { formatBDT } from "@/lib/money";

interface BarcodePrintItem {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string;
  retailPrice: number; // poisha
}

interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: BarcodePrintItem | null;
}

export function BarcodePrintModal({ isOpen, onClose, item }: BarcodePrintModalProps) {
  const [copies, setCopies] = useState<number>(10);
  const [labelSize, setLabelSize] = useState<"standard" | "compact">("standard");

  if (!isOpen || !item) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm print:p-0 print:bg-white">
      {/* Non-printable dialog container */}
      <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl print:hidden">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Print Barcode Labels</h3>
            <p className="text-xs text-slate-500">
              Preview and print thermal or A4 sheet barcode labels
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Options */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700">Copies to print</label>
            <input
              type="number"
              min={1}
              max={100}
              value={copies}
              onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">Label Format</label>
            <select
              value={labelSize}
              onChange={(e) => setLabelSize(e.target.value as "standard" | "compact")}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            >
              <option value="standard">Standard (50mm x 30mm thermal / 30-up A4)</option>
              <option value="compact">Compact Jewelry/Small Tag (38mm x 25mm)</option>
            </select>
          </div>
        </div>

        {/* Live Label Preview */}
        <div className="mt-6">
          <label className="text-xs font-semibold text-slate-700">Single Label Preview</label>
          <div className="mt-2 flex justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
            <div className="flex w-52 flex-col items-center justify-center rounded-lg border border-slate-300 bg-white p-3 text-center shadow-sm">
              <span className="text-xs font-bold text-slate-900 line-clamp-1">
                {item.productName}
              </span>
              <span className="text-[11px] text-slate-500">{item.variantName}</span>

              {/* Barcode visual rendering */}
              <div className="my-2 flex flex-col items-center">
                {/* SVG Code-128 / EAN simulation */}
                <div className="flex h-10 items-end gap-[1.5px] px-2">
                  {item.barcode.split("").map((digit, i) => (
                    <div
                      key={i}
                      className="bg-black"
                      style={{
                        width: (parseInt(digit, 10) % 3) + 1.5 + "px",
                        height: i % 2 === 0 ? "36px" : "30px",
                      }}
                    />
                  ))}
                </div>
                <span className="font-mono text-[11px] font-semibold tracking-widest text-slate-800">
                  {item.barcode}
                </span>
              </div>

              <div className="flex w-full items-center justify-between border-t border-slate-100 pt-1 text-[11px]">
                <span className="font-mono text-slate-400">{item.sku}</span>
                <span className="font-bold text-emerald-700">{formatBDT(item.retailPrice)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            <Printer className="h-4 w-4" />
            <span>Print {copies} Labels</span>
          </button>
        </div>
      </div>

      {/* Printable Sheet (visible ONLY when printing) */}
      <div className="hidden print:grid print:grid-cols-3 print:gap-4 print:p-2 w-full">
        {Array.from({ length: copies }).map((_, idx) => (
          <div
            key={idx}
            className="flex flex-col items-center justify-center border border-slate-400 p-2 text-center break-inside-avoid"
            style={{ width: "65mm", height: "35mm" }}
          >
            <span className="text-[10px] font-bold text-black uppercase leading-tight line-clamp-1">
              {item.productName}
            </span>
            <span className="text-[9px] text-gray-700 leading-tight">{item.variantName}</span>

            {/* Printable barcode lines */}
            <div className="my-1 flex h-8 items-end gap-[1.5px]">
              {item.barcode.split("").map((digit, i) => (
                <div
                  key={i}
                  className="bg-black"
                  style={{
                    width: (parseInt(digit, 10) % 3) + 1.5 + "px",
                    height: i % 2 === 0 ? "28px" : "24px",
                  }}
                />
              ))}
            </div>
            <span className="font-mono text-[9px] font-bold tracking-widest text-black">
              {item.barcode}
            </span>

            <div className="flex w-full items-center justify-between border-t border-gray-300 pt-0.5 text-[9px]">
              <span className="font-mono text-gray-600">{item.sku}</span>
              <span className="font-bold text-black">{formatBDT(item.retailPrice)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
