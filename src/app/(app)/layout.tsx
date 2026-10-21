import React from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TenantProvider, TenantMembership } from "@/context/tenant-context";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { UserRole } from "@/types/database.types";
import Link from "next/link";
import { LogOut, ShoppingCart, Package, Users, BarChart3, Settings, Boxes, Truck } from "lucide-react";
import { PermissionGuard } from "@/components/ui/permission-guard";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch tenant memberships under RLS
  const { data: rawMemberships } = (await supabase
    .from("tenant_members")
    .select(`
      id,
      role,
      is_active,
      tenant_id,
      tenants (
        id,
        name,
        slug,
        currency,
        timezone
      )
    `)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .is("deleted_at", null)) as {
    data: Array<{
      id: string;
      role: UserRole;
      is_active: boolean;
      tenant_id: string;
      tenants: unknown;
    }> | null;
  };

  const memberships: TenantMembership[] = (rawMemberships || []).map((m) => ({
    memberId: m.id,
    role: m.role,
    tenant: m.tenants as unknown as TenantMembership["tenant"],
  }));

  // If user has zero stores, send them to onboarding
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  return (
    <TenantProvider initialMemberships={memberships}>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Navigation Bar */}
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-6">
              {/* Logo */}
              <Link href="/dashboard" className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold text-lg shadow-sm">
                  দ
                </div>
                <span className="font-bold text-slate-900 text-lg tracking-tight">Dokani</span>
              </Link>

              {/* Tenant Switcher */}
              <TenantSwitcher />

              {/* Main Nav Links */}
              <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-600">
                <Link
                  href="/dashboard"
                  className="rounded-lg px-3 py-1.5 hover:bg-slate-100 hover:text-slate-900 transition"
                >
                  Dashboard
                </Link>

                <Link
                  href="/pos"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-slate-100 hover:text-slate-900 transition"
                >
                  <ShoppingCart className="h-4 w-4 text-emerald-600" />
                  <span>POS Terminal</span>
                </Link>

                <Link
                  href="/catalog"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-slate-100 hover:text-slate-900 transition"
                >
                  <Package className="h-4 w-4" />
                  <span>Catalog</span>
                </Link>

                {/* Inventory Operations: Hidden for Cashiers */}
                <PermissionGuard action="manage:inventory">
                  <Link
                    href="/inventory"
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-slate-100 hover:text-slate-900 transition"
                  >
                    <Boxes className="h-4 w-4" />
                    <span>Inventory</span>
                  </Link>
                </PermissionGuard>

                <PermissionGuard action="manage:inventory">
                  <Link
                    href="/inventory/suppliers"
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-slate-100 hover:text-slate-900 transition"
                  >
                    <Truck className="h-4 w-4" />
                    <span>Suppliers</span>
                  </Link>
                </PermissionGuard>

                <Link
                  href="/customers"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-slate-100 hover:text-slate-900 transition"
                >
                  <Users className="h-4 w-4" />
                  <span>Customers</span>
                </Link>

                {/* Reports: Hidden for Cashiers */}
                <PermissionGuard action="view:reports">
                  <Link
                    href="/reports"
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-slate-100 hover:text-slate-900 transition"
                  >
                    <BarChart3 className="h-4 w-4" />
                    <span>Reports</span>
                  </Link>
                </PermissionGuard>

                {/* Staff Settings: Hidden for Cashiers */}
                <PermissionGuard action="manage:members">
                  <Link
                    href="/settings/members"
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-slate-100 hover:text-slate-900 transition"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Staff</span>
                  </Link>
                </PermissionGuard>
              </nav>
            </div>

            {/* User Profile & Sign Out */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-900 leading-tight">
                  {user.user_metadata?.full_name || user.email?.split("@")[0]}
                </span>
                <span className="text-[11px] text-slate-500 font-mono truncate max-w-[120px]">
                  {user.email}
                </span>
              </div>

              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
                  title="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </TenantProvider>
  );
}
