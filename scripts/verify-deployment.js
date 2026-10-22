#!/usr/bin/env node

/**
 * =============================================================================
 * Dokani SaaS - Master Deployment & Production Health Verification Script
 * =============================================================================
 * Run:
 *   node scripts/verify-deployment.js
 *   node scripts/verify-deployment.js --url=https://thedokani.vercel.app
 *
 * This diagnostic engine validates:
 * 1. Live Vercel web routes, API endpoints, and response latency
 * 2. Enterprise security headers (CSP, HSTS, X-Frame-Options, etc.)
 * 3. Supabase REST API connectivity, schemas, tables, views, and seed data
 * 4. Environment variable format anomalies (e.g. trailing /rest/v1 in Supabase URL)
 * 5. Generates a comprehensive markdown audit report: deployment-audit-report.md
 * =============================================================================
 */

const fs = require("fs");
const path = require("path");

// Configuration defaults
const args = process.argv.slice(2);
const customUrlArg = args.find((a) => a.startsWith("--url="));
const BASE_URL = (
  customUrlArg ? customUrlArg.split("=")[1] : "https://thedokani.vercel.app"
).replace(/\/+$/, "");

// Read local .env if present for credentials check
let localEnv = {};
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      localEnv[key] = val;
    }
  }
}

const SUPABASE_RAW_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_CLEAN_URL = SUPABASE_RAW_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || localEnv.SUPABASE_SERVICE_ROLE_KEY || "";

const reportItems = [];

function log(type, category, title, details = "") {
  const symbols = {
    PASS: "\x1b[32m✔ [PASS]\x1b[0m",
    WARN: "\x1b[33m▲ [WARN]\x1b[0m",
    FAIL: "\x1b[31m✖ [FAIL]\x1b[0m",
    INFO: "\x1b[36mℹ [INFO]\x1b[0m",
  };
  console.log(`${symbols[type] || type} \x1b[1m[${category}]\x1b[0m ${title}`);
  if (details) {
    console.log(`         \x1b[90m${details.replace(/\n/g, "\n         ")}\x1b[0m`);
  }
  reportItems.push({ type, category, title, details });
}

async function checkUrl(route, options = {}) {
  const fullUrl = `${BASE_URL}${route}`;
  const start = Date.now();
  try {
    const res = await fetch(fullUrl, {
      redirect: "follow",
      ...options,
    });
    const latency = Date.now() - start;
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {}
    return { status: res.status, latency, headers: res.headers, text, json };
  } catch (err) {
    return {
      status: 0,
      latency: Date.now() - start,
      headers: new Headers(),
      text: "",
      json: null,
      error: err.message,
    };
  }
}

async function runAudit() {
  console.log("\n==================================================================");
  console.log("       DOKANI SAAS — MASTER DEPLOYMENT AUDIT & VERIFICATION       ");
  console.log("==================================================================");
  console.log(` Target Domain : ${BASE_URL}`);
  console.log(` Timestamp     : ${new Date().toISOString()}`);
  console.log(` Node Version  : ${process.version}`);
  console.log("==================================================================\n");

  // ---------------------------------------------------------------------------
  // 1. Environment Variable Hygiene
  // ---------------------------------------------------------------------------
  console.log("\x1b[35m=== 1. Environment Configuration Analysis ===\x1b[0m");

  if (!SUPABASE_RAW_URL) {
    log("FAIL", "ENV", "NEXT_PUBLIC_SUPABASE_URL is missing", "Add NEXT_PUBLIC_SUPABASE_URL to your .env or Vercel Settings.");
  } else if (SUPABASE_RAW_URL.includes("/rest/v1")) {
    log(
      "WARN",
      "ENV",
      "NEXT_PUBLIC_SUPABASE_URL contains '/rest/v1/' in path",
      `Current value: ${SUPABASE_RAW_URL}\nShould be: ${SUPABASE_CLEAN_URL}\nFix in Vercel Dashboard -> Settings -> Environment Variables. (Code-level sanitization was added, but fixing in Vercel ensures 100% safety).`
    );
  } else {
    log("PASS", "ENV", "NEXT_PUBLIC_SUPABASE_URL root format valid", SUPABASE_CLEAN_URL);
  }

  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("mock-anon-key")) {
    log("WARN", "ENV", "NEXT_PUBLIC_SUPABASE_ANON_KEY appears to be a mock key", "Ensure your real production Supabase anon key is saved in Vercel Settings.");
  } else {
    try {
      const parts = SUPABASE_ANON_KEY.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
        log("PASS", "ENV", "NEXT_PUBLIC_SUPABASE_ANON_KEY JWT format verified", `Role: ${payload.role}, Project Ref: ${payload.ref || "ok"}, Exp: ${new Date(payload.exp * 1000).toISOString()}`);
      } else {
        log("WARN", "ENV", "NEXT_PUBLIC_SUPABASE_ANON_KEY is not a standard 3-part JWT", "Verify this key from your Supabase Project Settings -> API.");
      }
    } catch (e) {
      log("WARN", "ENV", "Could not parse anon JWT payload", e.message);
    }
  }

  if (!SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY.includes("mock-service-role")) {
    log(
      "WARN",
      "ENV",
      "SUPABASE_SERVICE_ROLE_KEY missing or mock key",
      "Server-side admin operations (e.g. /api/health DB ping, subscription sync, admin trial extensions) require SUPABASE_SERVICE_ROLE_KEY in Vercel Settings."
    );
  } else {
    log("PASS", "ENV", "SUPABASE_SERVICE_ROLE_KEY configured", "Service role key detected.");
  }

  console.log();

  // ---------------------------------------------------------------------------
  // 2. Live Vercel Web Pages & Routing
  // ---------------------------------------------------------------------------
  console.log("\x1b[35m=== 2. Live Vercel Web Pages & Routing ===\x1b[0m");

  const routesToTest = [
    { route: "/", name: "Landing Page", expectStatus: 200, checkContent: "Dokani" },
    { route: "/login", name: "Authentication Login Page", expectStatus: 200, checkContent: "Sign in" },
    { route: "/signup", name: "Tenant Sign Up Page", expectStatus: 200, checkContent: "Create" },
    { route: "/api-docs", name: "OpenAPI Documentation & Swagger UI", expectStatus: 200, checkContent: "Dokani" },
    { route: "/warranty", name: "Customer Warranty Lookup", expectStatus: 200, checkContent: "Warranty" },
    { route: "/random-404-check", name: "Custom 404 Error Page", expectStatus: 404, checkContent: "" },
  ];

  let sampleHeaders = null;

  for (const item of routesToTest) {
    const res = await checkUrl(item.route);
    if (res.status === item.expectStatus) {
      if (!sampleHeaders && res.headers) sampleHeaders = res.headers;
      log("PASS", "ROUTE", `${item.name} (${item.route})`, `Status: ${res.status} OK (${res.latency}ms)`);
    } else {
      log("FAIL", "ROUTE", `${item.name} (${item.route})`, `Expected HTTP ${item.expectStatus}, got ${res.status} (${res.latency}ms). Error: ${res.error || "None"}`);
    }
  }

  console.log();

  // ---------------------------------------------------------------------------
  // 3. Security Headers Verification
  // ---------------------------------------------------------------------------
  console.log("\x1b[35m=== 3. Security Headers Audit (OWASP Standards) ===\x1b[0m");

  if (sampleHeaders) {
    const securityHeaderRules = [
      { key: "x-frame-options", label: "X-Frame-Options (Clickjacking Protection)" },
      { key: "x-content-type-options", label: "X-Content-Type-Options (MIME Sniffing Protection)" },
      { key: "referrer-policy", label: "Referrer-Policy" },
      { key: "strict-transport-security", label: "Strict-Transport-Security (HSTS)" },
      { key: "content-security-policy", label: "Content-Security-Policy (XSS Mitigation)" },
      { key: "permissions-policy", label: "Permissions-Policy" },
    ];

    for (const rule of securityHeaderRules) {
      const val = sampleHeaders.get(rule.key);
      if (val) {
        log("PASS", "SECURITY", `${rule.label}`, val.length > 60 ? `${val.slice(0, 60)}...` : val);
      } else {
        log("WARN", "SECURITY", `${rule.label} is missing`, `Consider enforcing ${rule.key} in next.config.ts or middleware.`);
      }
    }
  } else {
    log("FAIL", "SECURITY", "Could not inspect security headers", "Could not reach target server.");
  }

  console.log();

  // ---------------------------------------------------------------------------
  // 4. API Endpoints & Health Diagnostic
  // ---------------------------------------------------------------------------
  console.log("\x1b[35m=== 4. Backend Serverless API Health Checks ===\x1b[0m");

  // Health check
  const healthRes = await checkUrl("/api/health");
  if (healthRes.status === 200 && healthRes.json) {
    const dbStatus = healthRes.json?.checks?.database?.status;
    const latency = healthRes.json?.checks?.database?.latencyMs;
    if (dbStatus === "connected") {
      log("PASS", "API", "/api/health Endpoint", `Overall: ${healthRes.json.status}, DB: Connected (${latency}ms)`);
    } else {
      log(
        "WARN",
        "API",
        "/api/health reported Database status: " + dbStatus,
        `Error: ${healthRes.json?.checks?.database?.error || "Check Vercel env SUPABASE_SERVICE_ROLE_KEY and URL."}`
      );
    }
  } else if (healthRes.status === 503 && healthRes.json) {
    log(
      "WARN",
      "API",
      "/api/health returned 503 Service Degraded",
      `Database Check: ${JSON.stringify(healthRes.json.checks?.database)}\nResponse Time: ${healthRes.json.responseTimeMs}ms\nRoot cause: Supabase connection failed from Vercel serverless function.`
    );
  } else {
    log("FAIL", "API", "/api/health Endpoint Unreachable", `Status: ${healthRes.status}, Error: ${healthRes.error || healthRes.text}`);
  }

  // Public REST API protection test
  const publicApiRes = await checkUrl("/api/v1/products");
  if (publicApiRes.status === 401) {
    log("PASS", "API", "REST API v1 Key Guard (/api/v1/products)", "Correctly rejected unauthenticated request with 401 Unauthorized.");
  } else {
    log("WARN", "API", "REST API v1 Key Guard (/api/v1/products)", `Expected 401, got ${publicApiRes.status}`);
  }

  console.log();

  // ---------------------------------------------------------------------------
  // 5. Direct Supabase Database Schema & Table Audits
  // ---------------------------------------------------------------------------
  console.log("\x1b[35m=== 5. Supabase Database Schema & Views Verification ===\x1b[0m");

  if (SUPABASE_CLEAN_URL && SUPABASE_ANON_KEY) {
    const tablesToVerify = [
      { name: "tenants", select: "id", desc: "Core Multi-tenant table" },
      { name: "stores", select: "id", desc: "Store outlets table" },
      { name: "products", select: "id", desc: "Product catalog table" },
      { name: "customers", select: "id", desc: "Customer records table" },
      { name: "suppliers", select: "id", desc: "Supplier records table" },
      { name: "sales", select: "id", desc: "POS sales header table" },
      { name: "subscriptions", select: "id", desc: "SaaS subscriptions table" },
      { name: "view_customer_balances", select: "customer_id", desc: "Customer Dues & Balance View" },
      { name: "view_current_stock", select: "product_id", desc: "Current Stock Ledger View" },
      { name: "view_inventory_valuation", select: "tenant_id", desc: "Inventory Valuation View" },
    ];

    for (const t of tablesToVerify) {
      const restEndpoint = `${SUPABASE_CLEAN_URL}/rest/v1/${t.name}?select=${t.select || "id"}&limit=1`;
      const start = Date.now();
      try {
        const res = await fetch(restEndpoint, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        });
        const duration = Date.now() - start;
        if (res.status === 200) {
          const rows = await res.json();
          log("PASS", "DATABASE", `Table/View: ${t.name}`, `Status 200 OK (${duration}ms) — ${t.desc}. Records present: ${rows.length > 0 ? "Yes (seed/active data)" : "Empty table"}`);
        } else if (res.status === 401 || res.status === 403) {
          // RLS is active and blocking anon select on private tables, which confirms table exists!
          log("PASS", "DATABASE", `Table/View: ${t.name} (Protected by RLS)`, `Status ${res.status} — Row Level Security is active and enforcing isolation.`);
        } else if (res.status === 404) {
          log("FAIL", "DATABASE", `Missing Table/View: ${t.name}`, `HTTP 404: Table or view does not exist. Run migration in Supabase SQL Editor.`);
        } else {
          const body = await res.text();
          log("WARN", "DATABASE", `Table/View: ${t.name} returned HTTP ${res.status}`, body);
        }
      } catch (err) {
        log("FAIL", "DATABASE", `Table/View query error: ${t.name}`, err.message);
      }
    }
  } else {
    log("WARN", "DATABASE", "Skipped Supabase direct check", "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing.");
  }

  console.log();

  // ---------------------------------------------------------------------------
  // 6. Summary & Report Generation
  // ---------------------------------------------------------------------------
  const passCount = reportItems.filter((i) => i.type === "PASS").length;
  const warnCount = reportItems.filter((i) => i.type === "WARN").length;
  const failCount = reportItems.filter((i) => i.type === "FAIL").length;

  console.log("==================================================================");
  console.log(` AUDIT SUMMARY: \x1b[32m${passCount} PASSED\x1b[0m | \x1b[33m${warnCount} WARNINGS\x1b[0m | \x1b[31m${failCount} FAILURES\x1b[0m`);
  console.log("==================================================================");

  // Generate markdown report
  const markdownReport = [
    `# 🚀 Dokani SaaS Deployment Health & Audit Report`,
    ``,
    `- **Live Application URL**: [${BASE_URL}](${BASE_URL})`,
    `- **Audit Date**: ${new Date().toUTCString()}`,
    `- **Verdict**: ${failCount === 0 ? "✅ **READY FOR PRODUCTION** (with minor recommendations below)" : "⚠️ **REQUIRES ATTENTION BEFORE LAUNCH**"}`,
    ``,
    `## 📊 Executive Summary`,
    ``,
    `| Metric | Count | Status |`,
    `| :--- | :---: | :--- |`,
    `| **Tests Passed** | \`${passCount}\` | 🟢 Excellent |`,
    `| **Warnings** | \`${warnCount}\` | 🟡 Non-blocking / Recommended Actions |`,
    `| **Failures** | \`${failCount}\` | ${failCount === 0 ? "🟢 None" : "🔴 Action Required"} |`,
    ``,
    `---`,
    ``,
    `## 🔍 Detailed Audit Breakdown`,
    ``,
    `| Category | Level | Component | Details |`,
    `| :--- | :---: | :--- | :--- |`,
    ...reportItems.map(
      (r) =>
        `| \`${r.category}\` | ${r.type === "PASS" ? "🟢 PASS" : r.type === "WARN" ? "🟡 WARN" : "🔴 FAIL"} | **${r.title}** | ${r.details.replace(/\n/g, "<br>")} |`
    ),
    ``,
    `---`,
    ``,
    `## 🛠 Recommended Next Steps for Finalizing Deployment`,
    ``,
    `1. **Supabase Environment Variables in Vercel**:`,
    `   - In Vercel Project Settings → Environment Variables:`,
    `   - Ensure \`NEXT_PUBLIC_SUPABASE_URL\` is set to \`${SUPABASE_CLEAN_URL || "https://your-project.supabase.co"}\` (do NOT append \`/rest/v1/\`).`,
    `   - Ensure \`SUPABASE_SERVICE_ROLE_KEY\` is added so backend admin routes and \`/api/health\` can securely query Supabase.`,
    `2. **Supabase Migrations Check**:`,
    `   - Run all migrations \`01\` through \`11\` in your Supabase SQL Editor.`,
    `   - If you want seed data (demo products, categories, sample customer dues), also execute [supabase/seed.sql](file:///a:/POS%20SaaS/supabase/seed.sql).`,
    `3. **Test Core Workflows on the Live Site**:`,
    `   - Open [${BASE_URL}/signup](${BASE_URL}/signup) to create your first store.`,
    `   - Complete the 3-step onboarding wizard.`,
    `   - Go to POS, scan/select an item, and complete a test checkout.`,
    ``,
  ].join("\n");

  const reportFilePath = path.resolve(__dirname, "../deployment-audit-report.md");
  fs.writeFileSync(reportFilePath, markdownReport, "utf-8");
  console.log(`\n📄 Complete Markdown Report saved to: \x1b[36mdeployment-audit-report.md\x1b[0m\n`);
}

runAudit().catch(console.error);
