import { UserRole } from "@/types/database.types";

/**
 * Granular application permissions for Dokani POS & Inventory SaaS.
 */
export type PermissionAction =
  | "view:cost_price"
  | "view:reports"
  | "view:expenses"
  | "manage:expenses"
  | "manage:catalog"
  | "manage:inventory"
  | "manage:suppliers"
  | "manage:purchases"
  | "manage:members"
  | "manage:billing"
  | "manage:tenant"
  | "create:sale"
  | "create:customer"
  | "view:catalog"
  | "view:stock"
  | "void:sale";

/**
 * Matrix mapping actions to allowed roles.
 */
const ROLE_PERMISSIONS: Record<PermissionAction, readonly UserRole[]> = {
  // Financial & Sensitive Data
  "view:cost_price": ["owner", "manager"],
  "view:reports": ["owner", "manager"],
  "view:expenses": ["owner", "manager"],
  "manage:expenses": ["owner", "manager"],

  // Catalog & Stock Administration
  "manage:catalog": ["owner", "manager"],
  "manage:inventory": ["owner", "manager"],
  "manage:suppliers": ["owner", "manager"],
  "manage:purchases": ["owner", "manager"],

  // Store Management & Billing
  "manage:members": ["owner", "manager"],
  "manage:billing": ["owner"],
  "manage:tenant": ["owner"],

  // POS Checkout Operations (Cashiers have full checkout access)
  "create:sale": ["owner", "manager", "cashier"],
  "create:customer": ["owner", "manager", "cashier"],
  "view:catalog": ["owner", "manager", "cashier"],
  "view:stock": ["owner", "manager", "cashier"],

  // Sale Voiding / Deletion (Manager+ only, with reason)
  "void:sale": ["owner", "manager"],
};

/**
 * Server and Client permission evaluator.
 * Returns true if the provided role is allowed to perform the given action.
 */
export function can(role: UserRole | null | undefined, action: PermissionAction): boolean {
  if (!role) return false;
  const allowedRoles = ROLE_PERMISSIONS[action];
  return allowedRoles ? allowedRoles.includes(role) : false;
}

/**
 * Throws an error or returns false if unauthorized.
 */
export function assertPermission(
  role: UserRole | null | undefined,
  action: PermissionAction
): void {
  if (!can(role, action)) {
    throw new Error(`Unauthorized: Role '${role || "anonymous"}' lacks permission '${action}'`);
  }
}

/**
 * Strips sensitive fields (such as cost_price) from items if caller lacks `view:cost_price`.
 */
export function sanitizeVariantForRole<T extends { cost_price: number }>(
  variant: T,
  role: UserRole | null | undefined
): Omit<T, "cost_price"> & { cost_price: number | null } {
  if (can(role, "view:cost_price")) {
    return variant;
  }
  return {
    ...variant,
    cost_price: null,
  };
}
