"use client";

import React from "react";
import { PermissionAction, can } from "@/lib/auth/permissions";
import { useTenant } from "@/context/tenant-context";

export interface PermissionGuardProps {
  action: PermissionAction;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * UI Permission Guard.
 * Hides children completely if the user's role lacks the requested permission.
 * Never simply disables sensitive controls; enforces strict DOM omission.
 */
export function PermissionGuard({
  action,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { currentRole } = useTenant();

  if (!can(currentRole, action)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
