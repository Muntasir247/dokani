"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { UserRole } from "@/types/database.types";

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
}

export interface TenantMembership {
  memberId: string;
  role: UserRole;
  tenant: TenantInfo;
}

interface TenantContextValue {
  memberships: TenantMembership[];
  activeTenant: TenantInfo | null;
  currentRole: UserRole | null;
  isLoading: boolean;
  switchTenant: (tenantId: string) => void;
  refreshTenants: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

const STORAGE_KEY = "dokani_active_tenant_id";

export function TenantProvider({
  children,
  initialMemberships = [],
}: {
  children: React.ReactNode;
  initialMemberships?: TenantMembership[];
}) {
  const [memberships, setMemberships] = useState<TenantMembership[]>(initialMemberships);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(initialMemberships.length === 0);

  const fetchTenants = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/auth/tenants");
      if (res.ok) {
        const json = await res.json();
        const items: TenantMembership[] = json.tenants || [];
        setMemberships(items);

        if (items.length > 0) {
          const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
          const match = items.find((m) => m.tenant.id === stored);
          setActiveTenantId(match ? match.tenant.id : items[0].tenant.id);
        }
      }
    } catch (err) {
      console.error("[TenantContext] Failed to load tenants:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialMemberships.length > 0) {
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const match = initialMemberships.find((m) => m.tenant.id === stored);
      setActiveTenantId(match ? match.tenant.id : initialMemberships[0].tenant.id);
      setIsLoading(false);
    } else {
      fetchTenants();
    }
  }, [initialMemberships]);

  const switchTenant = (tenantId: string) => {
    const exists = memberships.some((m) => m.tenant.id === tenantId);
    if (exists) {
      setActiveTenantId(tenantId);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, tenantId);
        // Also set a document cookie so server components can read the current tenant id
        document.cookie = `dokani_tenant_id=${tenantId}; path=/; max-age=31536000; SameSite=Lax`;
      }
    }
  };

  const activeMembership = memberships.find((m) => m.tenant.id === activeTenantId) || memberships[0] || null;
  const activeTenant = activeMembership ? activeMembership.tenant : null;
  const currentRole = activeMembership ? activeMembership.role : null;

  return (
    <TenantContext.Provider
      value={{
        memberships,
        activeTenant,
        currentRole,
        isLoading,
        switchTenant,
        refreshTenants: fetchTenants,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}
