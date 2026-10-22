"use client";

import React, { useState } from "react";
import {
  Code,
  Key,
  ShieldCheck,
  Zap,
  Lock,
  Copy,
  Check,
  Download,
  Terminal,
} from "lucide-react";

interface EndpointDoc {
  method: "GET" | "POST";
  path: string;
  scope: string;
  summary: string;
  curlExample: string;
  responseExample: string;
}

const ENDPOINTS: EndpointDoc[] = [
  {
    method: "GET",
    path: "/api/v1/products",
    scope: "read:products",
    summary: "List catalog products with pagination and search filters",
    curlExample: `curl -X GET "https://dokani.app/api/v1/products?page=1&limit=20" \\
  -H "Authorization: Bearer dk_live_YOUR_API_KEY"`,
    responseExample: `{
  "data": [
    {
      "id": "prod_01j9x...",
      "name": "Pran Frooto Mango 250ml",
      "sku": "FROOTO-250",
      "barcode": "894110023456",
      "retail_price": 30.00,
      "cost_price": 24.50,
      "track_inventory": true,
      "low_stock_threshold": 10
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasMore": false
  }
}`,
  },
  {
    method: "POST",
    path: "/api/v1/products",
    scope: "write:products",
    summary: "Create a new catalog item (enforces plan quotas)",
    curlExample: `curl -X POST "https://dokani.app/api/v1/products" \\
  -H "Authorization: Bearer dk_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Radhuni Turmeric Powder 200g",
    "retail_price": 85.00,
    "cost_price": 70.00,
    "barcode": "894110098765"
  }'`,
    responseExample: `{
  "data": {
    "id": "prod_01j9y...",
    "name": "Radhuni Turmeric Powder 200g",
    "retail_price": 85.00,
    "cost_price": 70.00,
    "barcode": "894110098765"
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/sales",
    scope: "read:sales",
    summary: "Retrieve historical sales invoices and payments",
    curlExample: `curl -X GET "https://dokani.app/api/v1/sales?page=1" \\
  -H "X-API-Key: dk_live_YOUR_API_KEY"`,
    responseExample: `{
  "data": [
    {
      "id": "sale_01j9z...",
      "invoice_number": "INV-2026-0042",
      "total_amount": 1250.00,
      "status": "completed",
      "created_at": "2026-10-22T07:30:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasMore": false }
}`,
  },
  {
    method: "POST",
    path: "/api/v1/sales",
    scope: "write:sales",
    summary: "Finalize a POS sale transaction with server-side inventory deduction",
    curlExample: `curl -X POST "https://dokani.app/api/v1/sales" \\
  -H "Authorization: Bearer dk_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "branch_id": "00000000-0000-0000-0000-000000000001",
    "items": [{"product_id": "prod_uuid", "quantity": 2, "unit_price": 30.00}],
    "payments": [{"payment_method": "bkash", "amount": 60.00}]
  }'`,
    responseExample: `{
  "data": {
    "id": "sale_uuid",
    "invoice_number": "INV-2026-0043",
    "total_amount": 60.00,
    "status": "completed"
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/inventory",
    scope: "read:inventory",
    summary: "Query stock levels, low-stock alerts, and inventory valuation",
    curlExample: `curl -X GET "https://dokani.app/api/v1/inventory?low_stock=true" \\
  -H "Authorization: Bearer dk_live_YOUR_API_KEY"`,
    responseExample: `{
  "data": [
    {
      "product_id": "prod_01j...",
      "name": "Teer Soybean Oil 5L",
      "current_stock": 2,
      "low_stock_threshold": 5,
      "is_low_stock": true,
      "valuation": 1600.00
    }
  ]
}`,
  },
];

export default function ApiDocsPage() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <header className="border-b border-slate-800 pb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                v1.0.0 Public API
              </span>
              <span className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Business Plan
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-3 text-white">
              Dokani Developer API
            </h1>
            <p className="text-slate-400 mt-2 max-w-2xl text-sm md:text-base">
              Integrate your ERP, eCommerce storefront, accounting software, or mobile app directly
              with your Dokani POS catalog, sales, inventory, and automated courier dispatches.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/openapi.json"
              download="dokani-openapi.json"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition"
            >
              <Download className="w-3.5 h-3.5" />
              Download OpenAPI 3.1
            </a>
          </div>
        </header>

        {/* Auth & Rate Limits Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-3 text-emerald-400 font-semibold mb-2">
              <Key className="w-5 h-5" />
              <h3>Authentication</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Authenticate all requests using your tenant API Key via either header:
            </p>
            <code className="block mt-2 p-2 bg-slate-950 border border-slate-800 rounded text-xs text-emerald-300 font-mono">
              Authorization: Bearer dk_live_...
            </code>
            <p className="text-[11px] text-slate-500 mt-2">
              Keys are SHA-256 hashed at rest and immediately disabled upon revocation.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-3 text-blue-400 font-semibold mb-2">
              <Zap className="w-5 h-5" />
              <h3>Rate Limiting</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Standard rate limits are enforced via sliding window (120 req/min per API Key).
            </p>
            <div className="mt-2 space-y-1 text-xs text-slate-300 font-mono">
              <div>X-RateLimit-Limit: 120</div>
              <div>X-RateLimit-Remaining: 119</div>
              <div>X-RateLimit-Reset: 1730000000</div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-3 text-amber-400 font-semibold mb-2">
              <ShieldCheck className="w-5 h-5" />
              <h3>Webhook Signatures</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              All outgoing events (<code className="text-amber-300 font-mono">sale.created</code>,{" "}
              <code className="text-amber-300 font-mono">stock.low</code>) are HMAC-SHA256 signed:
            </p>
            <code className="block mt-2 p-2 bg-slate-950 border border-slate-800 rounded text-xs text-amber-300 font-mono">
              X-Dokani-Signature: t=...,v1=...
            </code>
          </div>
        </div>

        {/* Endpoints Reference */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Code className="w-5 h-5 text-indigo-400" />
              API Endpoints
            </h2>
            <span className="text-xs text-slate-500">Base URL: https://dokani.app</span>
          </div>

          <div className="space-y-6">
            {ENDPOINTS.map((ep, idx) => (
              <div
                key={ep.path + ep.method}
                className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden"
              >
                <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 text-xs font-bold rounded ${
                        ep.method === "GET"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <span className="font-mono text-sm font-semibold text-slate-200">{ep.path}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full border border-slate-700">
                      Scope: {ep.scope}
                    </span>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <p className="text-sm text-slate-300">{ep.summary}</p>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                        <span className="flex items-center gap-1 font-mono">
                          <Terminal className="w-3.5 h-3.5" /> Request (cURL)
                        </span>
                        <button
                          onClick={() => handleCopy(ep.curlExample, idx * 2)}
                          className="hover:text-slate-200 transition"
                          title="Copy cURL"
                        >
                          {copiedIndex === idx * 2 ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto">
                        {ep.curlExample}
                      </pre>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                        <span className="font-mono">Response (200 / 201 JSON)</span>
                        <button
                          onClick={() => handleCopy(ep.responseExample, idx * 2 + 1)}
                          className="hover:text-slate-200 transition"
                          title="Copy response"
                        >
                          {copiedIndex === idx * 2 + 1 ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-blue-300 overflow-x-auto">
                        {ep.responseExample}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Webhooks Verification Code Snippet */}
        <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            Verifying Webhook Signatures in Node.js
          </h2>
          <p className="text-xs text-slate-400">
            Use this standard HMAC-SHA256 verification routine to validate signatures on incoming webhooks from Dokani:
          </p>
          <pre className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto">
{`const crypto = require("crypto");

function verifyDokaniWebhook(rawBody, signatureHeader, secret) {
  const parts = signatureHeader.split(",");
  const timestamp = parts.find(p => p.startsWith("t=")).split("=")[1];
  const receivedSig = parts.find(p => p.startsWith("v1=")).split("=")[1];

  const payload = \`\${timestamp}.\${rawBody}\`;
  const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(receivedSig, "hex"), Buffer.from(expectedSig, "hex"));
}`}
          </pre>
        </section>
      </div>
    </div>
  );
}
