"use client";

import React, { useState } from "react";
import { UploadCloud, CheckCircle2, AlertTriangle, X, FileText, Loader2 } from "lucide-react";
import { CSVValidationReport } from "@/lib/catalog/csv";

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onImportSuccess: () => void;
}

export function CSVImportModal({
  isOpen,
  onClose,
  tenantId,
  onImportSuccess,
}: CSVImportModalProps) {
  const [csvText, setCsvText] = useState<string>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<CSVValidationReport | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setReport(null);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvText(content || "");
    };
    reader.readAsText(file);
  };

  const handleDryRunValidation = async () => {
    if (!csvText.trim()) {
      setErrorMessage("Please select or paste a CSV file to validate.");
      return;
    }

    setIsValidating(true);
    setErrorMessage(null);
    setReport(null);

    try {
      const res = await fetch("/api/catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          csvContent: csvText,
          dryRun: true,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErrorMessage(json.error || "Validation failed.");
      } else {
        setReport(json.report);
      }
    } catch {
      setErrorMessage("Failed to connect to the server for validation.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!report || report.errorCount > 0) return;

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          csvContent: csvText,
          dryRun: false,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErrorMessage(json.error || "Import failed.");
      } else {
        onImportSuccess();
        onClose();
      }
    } catch {
      setErrorMessage("Failed to execute import.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Bulk CSV Product Import</h3>
            <p className="text-xs text-slate-500">
              Upload a CSV file with automatic dry-run validation and row-level error reporting
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
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Upload Dropzone */}
        <div className="mt-4">
          <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 hover:bg-slate-100/70 cursor-pointer transition">
            <UploadCloud className="h-10 w-10 text-slate-400 mb-2" />
            <span className="text-sm font-semibold text-slate-700">
              {fileName ? fileName : "Click to select or drop CSV file"}
            </span>
            <span className="text-xs text-slate-400 mt-1">
              Supports standard format: name, category, brand, sku, retail_price, etc.
            </span>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        {/* Paste or Preview Option */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-700">Or Paste CSV Data Directly</label>
            {csvText && (
              <span className="text-xs text-slate-400">
                {csvText.split("\n").filter((l) => l.trim()).length} lines
              </span>
            )}
          </div>
          <textarea
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setReport(null);
            }}
            rows={4}
            placeholder="name,category,brand,unit,sku,barcode,cost_price,retail_price,tax_rate,reorder_point,opening_stock,has_serials,warranty_months"
            className="w-full rounded-lg border border-slate-200 p-2.5 font-mono text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Dry Run Validation Report Card */}
        {report && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Dry-Run Validation Report
              </span>
              <span className="text-xs font-mono text-slate-500">
                Total Rows: {report.totalRows}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <div>
                  <span className="text-xs font-semibold text-emerald-900">Valid Rows</span>
                  <p className="text-lg font-bold text-emerald-700">{report.validCount}</p>
                </div>
              </div>

              <div
                className={`flex items-center gap-3 rounded-lg border p-3 ${
                  report.errorCount > 0
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <AlertTriangle
                  className={`h-5 w-5 ${
                    report.errorCount > 0 ? "text-rose-600" : "text-slate-400"
                  }`}
                />
                <div>
                  <span className="text-xs font-semibold">Rejected Rows</span>
                  <p
                    className={`text-lg font-bold ${
                      report.errorCount > 0 ? "text-rose-700" : "text-slate-500"
                    }`}
                  >
                    {report.errorCount}
                  </p>
                </div>
              </div>
            </div>

            {/* Error Table */}
            {report.errorCount > 0 ? (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-rose-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-rose-50 text-rose-900 font-semibold sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Row</th>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Offending Value</th>
                      <th className="py-2 px-3">Error Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100 font-mono">
                    {report.errors.map((err, i) => (
                      <tr key={i} className="hover:bg-rose-50/50">
                        <td className="py-1.5 px-3 font-bold text-rose-800">{err.row}</td>
                        <td className="py-1.5 px-3 text-slate-700">{err.column}</td>
                        <td className="py-1.5 px-3 text-slate-500 truncate max-w-[120px]">
                          {err.value || "(empty)"}
                        </td>
                        <td className="py-1.5 px-3 text-rose-700 font-sans">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-100/70 p-3 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>All {report.validCount} rows passed validation with zero errors! Ready to import.</span>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDryRunValidation}
              disabled={isValidating || !csvText.trim()}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition"
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  <span>Validating...</span>
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 text-slate-500" />
                  <span>Dry-Run Validation</span>
                </>
              )}
            </button>

            <button
              onClick={handleExecuteImport}
              disabled={isImporting || !report || report.errorCount > 0}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Import {report?.validCount ? `${report.validCount} Products` : "Now"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
