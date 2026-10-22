"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  WifiOff,
  Layers,
  Truck,
  Printer,
  ShieldCheck,
  Check,
  ArrowRight,
  Sparkles,
  Code2,
  CreditCard,
  ExternalLink,
  Copy,
} from "lucide-react";

export default function HomePage() {
  const [copiedDemo, setCopiedDemo] = useState(false);

  const copyDemoCredentials = () => {
    navigator.clipboard.writeText("demo@dokani.app / dokani2026!");
    setCopiedDemo(true);
    setTimeout(() => setCopiedDemo(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
      {/* Navigation Bar */}
      <nav className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white font-extrabold text-lg shadow-lg shadow-emerald-500/20">
              দ
            </div>
            <span className="font-extrabold text-xl tracking-tight text-white">
              Dokani <span className="text-emerald-400 font-normal text-sm">(দোকানী)</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-emerald-400 transition">
              Features
            </a>
            <a href="#offline" className="hover:text-emerald-400 transition">
              Offline Sync
            </a>
            <a href="#pricing" className="hover:text-emerald-400 transition">
              Pricing
            </a>
            <Link href="/api-docs" className="hover:text-emerald-400 transition flex items-center gap-1">
              <Code2 className="w-3.5 h-3.5" /> API
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/pos"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md shadow-emerald-600/30 flex items-center gap-1.5"
            >
              <span>Launch POS Demo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 pb-28 overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none" />
        <div className="absolute top-1/3 left-1/4 w-[350px] h-[250px] bg-teal-500/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 text-center relative z-10 space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Next-Generation Retail Infrastructure for Bangladesh</span>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
            Dokani (দোকানী) —{" "}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Multi-tenant, offline-first Point-of-Sale
            </span>{" "}
            & inventory SaaS
          </h1>

          <p className="max-w-3xl mx-auto text-base md:text-lg text-slate-300 leading-relaxed font-normal">
            Engineered for high-throughput retail stores, supermarkets, and electronics shops in Bangladesh.
            Keeps scanning and selling without an internet connection, synchronizes reliably when reconnected,
            and automates courier delivery in a single click.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              href="/pos"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm transition shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2"
            >
              <span>Explore Interactive POS Terminal</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/api-docs"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold text-sm transition flex items-center justify-center gap-2"
            >
              <Code2 className="w-4 h-4 text-emerald-400" />
              <span>Public Developer API</span>
            </Link>
          </div>

          {/* Demo Credentials Card */}
          <div className="max-w-md mx-auto rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-left shadow-lg">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <span>Instant Sandbox Demo Access</span>
              <button
                onClick={copyDemoCredentials}
                className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 lowercase text-xs"
              >
                {copiedDemo ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedDemo ? "copied!" : "copy credentials"}
              </button>
            </div>
            <div className="font-mono text-xs text-slate-300 space-y-1 bg-slate-950 p-2.5 rounded border border-slate-800/80">
              <div>
                <span className="text-slate-500">Demo User:</span> demo@dokani.app
              </div>
              <div>
                <span className="text-slate-500">Password:</span> dokani2026!
              </div>
              <div>
                <span className="text-slate-500">Store:</span> Dhanmondi Superstore (Branch #1)
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Architectural Pillars */}
      <section id="features" className="py-20 border-t border-slate-800/80 bg-slate-900/30">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Built for Scale & Reliability
            </span>
            <h2 className="text-3xl font-extrabold text-white">
              Engineered Beyond Standard POS Software
            </h2>
            <p className="text-slate-400 text-sm">
              Solving real retail bottlenecks: network instability, inventory theft, duplicate courier bookings, and reconciliation errors.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-emerald-500/40 transition">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
                <WifiOff className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Offline-First Engine</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                IndexedDB (Dexie) client outbox with monotonic UUID v7 identifiers. Make sales with the Wi-Fi unplugged; syncs automatically with zero duplicate transactions upon reconnecting.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-emerald-500/40 transition">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center mb-4">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Double-Entry Stock Ledger</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                No loose stock count updates. Every inventory change is an immutable stock movement with cost basis. Supports serial tracking (IMEI/SN) and automated dead-stock detection.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-emerald-500/40 transition">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-4">
                <Truck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">1-Click Courier Dispatch</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Native Steadfast & Pathao integration. Features strict duplicate-dispatch guards, BD phone normalization (01...), encrypted credentials, and timeline tracking.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-emerald-500/40 transition">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4">
                <Printer className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Receipt & Invoice Engine</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Dual printing optimized with @page CSS: 80mm thermal receipts for quick sales, and corporate A4 tax invoices with QR verification codes for public warranty checks.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-emerald-500/40 transition">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-4">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">PostgreSQL RLS Multi-Tenancy</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Strict Row Level Security (RLS) guarantees complete tenant isolation at the database kernel. A query can never cross workspace boundaries even if application code fails.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-emerald-500/40 transition">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center mb-4">
                <CreditCard className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Split & Due Payments</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Accept split payments in single tickets (Cash + bKash + Card). Automated customer dues ledger with credit limits, payment collection flows, and aging debt analytics.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Matrix */}
      <section id="pricing" className="py-20 border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Transparent Pricing</span>
            <h2 className="text-3xl font-extrabold text-white">Simple Plans That Grow With Your Store</h2>
            <p className="text-slate-400 text-sm">
              All plans include complete offline POS support, barcode scanning, and receipt printing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {/* Free Tier */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 flex flex-col justify-between">
              <div>
                <h4 className="text-lg font-bold text-white">Free Starter</h4>
                <p className="text-xs text-slate-400 mt-1">Perfect for single-counter corner shops</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">৳0</span>
                  <span className="text-xs text-slate-400">/month</span>
                </div>
                <ul className="mt-6 space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> 1 Branch & 2 Staff Users
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Up to 200 Catalog Products
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Offline POS & Outbox Sync
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> 80mm Thermal Receipts
                  </li>
                </ul>
              </div>
              <Link
                href="/pos"
                className="mt-8 block text-center py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition"
              >
                Start Free
              </Link>
            </div>

            {/* Pro Tier (Popular) */}
            <div className="rounded-2xl border-2 border-emerald-500 bg-slate-900/90 p-8 flex flex-col justify-between relative shadow-2xl shadow-emerald-500/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-500 text-slate-950 font-extrabold text-[10px] uppercase tracking-wider">
                Most Popular
              </div>
              <div>
                <h4 className="text-lg font-bold text-white">Pro Retail</h4>
                <p className="text-xs text-slate-400 mt-1">For growing multi-counter retail stores</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">৳1,499</span>
                  <span className="text-xs text-slate-400">/month</span>
                </div>
                <ul className="mt-6 space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> 3 Branches & 10 Staff Users
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Up to 5,000 Catalog Products
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Serial Tracking (IMEI/SN) & Warranty
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Customer Loyalty & Price Tiers
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Cash Drawer Shift Variance Tracking
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Full CSV & PDF Reports Export
                  </li>
                </ul>
              </div>
              <Link
                href="/pos"
                className="mt-8 block text-center py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition shadow-lg shadow-emerald-600/30"
              >
                Upgrade to Pro
              </Link>
            </div>

            {/* Business Tier */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 flex flex-col justify-between">
              <div>
                <h4 className="text-lg font-bold text-white">Business Enterprise</h4>
                <p className="text-xs text-slate-400 mt-1">For supermarket chains & ERP integrations</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">৳3,999</span>
                  <span className="text-xs text-slate-400">/month</span>
                </div>
                <ul className="mt-6 space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Unlimited Branches & 50 Staff Users
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Unlimited Catalog Products
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Public REST API & Webhooks Access
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Steadfast & Pathao Automated Dispatch
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Custom Courier Adapter Support
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Priority 24/7 Operations Support
                  </li>
                </ul>
              </div>
              <Link
                href="/api-docs"
                className="mt-8 block text-center py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition"
              >
                Explore Enterprise
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-12 text-slate-500 text-xs">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">Dokani POS SaaS</span>
            <span>•</span>
            <span>© 2026 All Rights Reserved</span>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/api-docs" className="hover:text-slate-300 transition">
              Developer API
            </Link>
            <Link href="/api/health" className="hover:text-slate-300 transition">
              Health Status
            </Link>
            <a href="https://github.com/Muntasir247/dokani" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition flex items-center gap-1">
              <span>GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
