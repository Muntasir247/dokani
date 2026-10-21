"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Store, Building2, CheckCircle2 } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [branchName, setBranchName] = useState("Main Outlet");
  const [branchCode, setBranchCode] = useState("MAIN-01");
  const [currency] = useState("BDT");
  const [timezone] = useState("Asia/Dhaka");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-generate slug and branch code from store name
  const handleStoreNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setStoreName(val);
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setSlug(generatedSlug);

    const initials = val
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 4);
    if (initials) {
      setBranchCode(`${initials}-01`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantName: storeName,
          slug,
          storeName: branchName,
          storeCode: branchCode,
          currency,
          timezone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Failed to initialize store");
        return;
      }

      // Successfully provisioned tenant, branch, owner role, and free plan
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white font-bold text-2xl shadow-lg shadow-emerald-600/20">
            <Store className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Set up your Store</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create your store tenant, initial outlet, and activate your Free plan
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" />
              <span>Store & Outlet Details</span>
            </CardTitle>
            <CardDescription>
              This provisions your multi-tenant environment with an append-only stock ledger and owner controls.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {errorMsg && (
              <div className="mb-5 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Store Business Name"
                  placeholder="e.g. Dhaka Gadget Hub"
                  value={storeName}
                  onChange={handleStoreNameChange}
                  required
                />

                <Input
                  label="Store URL Slug"
                  placeholder="e.g. dhaka-gadget-hub"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  helperText={`App URL: dokani.app/${slug || "..."}`}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <Input
                  label="First Branch / Outlet Name"
                  placeholder="e.g. Elephant Road Branch"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  required
                />

                <Input
                  label="Branch Code"
                  placeholder="e.g. DGH-01"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 mt-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Free Plan Included by Default</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-emerald-800">
                  <div>• 1 Store Outlet</div>
                  <div>• 2 Staff Members</div>
                  <div>• 200 Products</div>
                </div>
              </div>

              <Button type="submit" className="w-full mt-6" size="lg" isLoading={isLoading}>
                Create Store & Launch POS
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
