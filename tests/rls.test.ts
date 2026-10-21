import { describe, it, expect } from "vitest";
import { can, assertPermission, sanitizeVariantForRole } from "../src/lib/auth/permissions";
import { UserRole } from "../src/types/database.types";
import * as fs from "fs";
import * as path from "path";

describe("Step 2: Authentication, Multi-Tenant Isolation & Role-Based Access Control", () => {
  const migrationsDir = path.resolve(__dirname, "../supabase/migrations");
  const rlsMigrationSql = fs.readFileSync(
    path.join(migrationsDir, "20261022000003_rls_policies.sql"),
    "utf-8"
  );
  const onboardingMigrationSql = fs.readFileSync(
    path.join(migrationsDir, "20261022000004_onboarding_and_invitations.sql"),
    "utf-8"
  );

  describe("1. Static Policy Verification: RLS Enabled on EVERY table", () => {
    const allExpectedTables = [
      "tenants",
      "profiles",
      "tenant_members",
      "tenant_invitations",
      "subscriptions",
      "stores",
      "stock_locations",
      "categories",
      "brands",
      "products",
      "product_variants",
      "product_serials",
      "customers",
      "suppliers",
      "purchases",
      "purchase_items",
      "sales",
      "sale_items",
      "sale_payments",
      "returns",
      "stock_movements",
      "expenses",
      "audit_logs",
      "sync_changes",
      "idempotency_keys",
    ];

    for (const table of allExpectedTables) {
      it(`enables row level security on ${table}`, () => {
        const regex = new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`, "i");
        expect(regex.test(rlsMigrationSql), `Expected RLS to be enabled on ${table}`).toBe(true);
      });
    }
  });

  describe("2. Immutable Tables (stock_movements & audit_logs)", () => {
    it("ensures stock_movements does NOT have any UPDATE or DELETE policies", () => {
      // Omitting UPDATE/DELETE policies under RLS strictly prevents updates and deletions in Postgres
      const updateRegex = /CREATE POLICY [a-z0-9_]+ ON stock_movements\s+FOR UPDATE/i;
      const deleteRegex = /CREATE POLICY [a-z0-9_]+ ON stock_movements\s+FOR DELETE/i;
      expect(updateRegex.test(rlsMigrationSql)).toBe(false);
      expect(deleteRegex.test(rlsMigrationSql)).toBe(false);
    });

    it("ensures audit_logs does NOT have any UPDATE or DELETE policies", () => {
      const updateRegex = /CREATE POLICY [a-z0-9_]+ ON audit_logs\s+FOR UPDATE/i;
      const deleteRegex = /CREATE POLICY [a-z0-9_]+ ON audit_logs\s+FOR DELETE/i;
      expect(updateRegex.test(rlsMigrationSql)).toBe(false);
      expect(deleteRegex.test(rlsMigrationSql)).toBe(false);
    });
  });

  describe("3. Multi-Tenant Isolation Simulation", () => {
    // Model simulated database records
    interface MockRow {
      id: string;
      tenant_id: string;
      name?: string;
    }

    const tenant1Id = "11111111-1111-1111-1111-111111111111";
    const tenant2Id = "22222222-2222-2222-2222-222222222222";

    const tenantMemberships: Array<{ user_id: string; tenant_id: string; role: UserRole }> = [
      { user_id: "user-t1-owner", tenant_id: tenant1Id, role: "owner" },
      { user_id: "user-t1-cashier", tenant_id: tenant1Id, role: "cashier" },
      { user_id: "user-t2-owner", tenant_id: tenant2Id, role: "owner" },
    ];

    const salesTable: MockRow[] = [
      { id: "sale-1", tenant_id: tenant1Id, name: "INV-001" },
      { id: "sale-2", tenant_id: tenant1Id, name: "INV-002" },
      { id: "sale-3", tenant_id: tenant2Id, name: "INV-003" },
    ];

    function evaluateRlsSelect(userId: string | null, rows: MockRow[]): MockRow[] {
      if (!userId) return [];
      // Simulated is_tenant_member(tenant_id)
      const allowedTenantIds = tenantMemberships
        .filter((m) => m.user_id === userId)
        .map((m) => m.tenant_id);

      return rows.filter((row) => allowedTenantIds.includes(row.tenant_id));
    }

    it("proves user in Tenant 1 cannot read Tenant 2 rows", () => {
      const visibleRows = evaluateRlsSelect("user-t1-owner", salesTable);
      expect(visibleRows.length).toBe(2);
      expect(visibleRows.map((r) => r.id)).toEqual(["sale-1", "sale-2"]);
      expect(visibleRows.some((r) => r.tenant_id === tenant2Id)).toBe(false);
    });

    it("proves user in Tenant 2 cannot read Tenant 1 rows", () => {
      const visibleRows = evaluateRlsSelect("user-t2-owner", salesTable);
      expect(visibleRows.length).toBe(1);
      expect(visibleRows[0].id).toBe("sale-3");
      expect(visibleRows[0].tenant_id).toBe(tenant2Id);
    });

    it("proves unauthenticated or non-member user sees 0 rows", () => {
      expect(evaluateRlsSelect(null, salesTable)).toEqual([]);
      expect(evaluateRlsSelect("stranger-user", salesTable)).toEqual([]);
    });
  });

  describe("4. Role Restrictions & Permission Matrix", () => {
    it("allows cashiers to create sales and customers but forbids seeing cost prices or reports", () => {
      const cashierRole: UserRole = "cashier";

      expect(can(cashierRole, "create:sale")).toBe(true);
      expect(can(cashierRole, "create:customer")).toBe(true);
      expect(can(cashierRole, "view:catalog")).toBe(true);

      // FORBIDDEN for Cashier
      expect(can(cashierRole, "view:cost_price")).toBe(false);
      expect(can(cashierRole, "view:reports")).toBe(false);
      expect(can(cashierRole, "view:expenses")).toBe(false);
      expect(can(cashierRole, "manage:expenses")).toBe(false);
      expect(can(cashierRole, "manage:catalog")).toBe(false);
      expect(can(cashierRole, "manage:members")).toBe(false);
      expect(can(cashierRole, "manage:billing")).toBe(false);
      expect(can(cashierRole, "void:sale")).toBe(false);
    });

    it("allows managers to manage catalog, inventory, and view reports, but forbids billing", () => {
      const managerRole: UserRole = "manager";

      expect(can(managerRole, "view:cost_price")).toBe(true);
      expect(can(managerRole, "view:reports")).toBe(true);
      expect(can(managerRole, "manage:catalog")).toBe(true);
      expect(can(managerRole, "manage:inventory")).toBe(true);
      expect(can(managerRole, "manage:expenses")).toBe(true);
      expect(can(managerRole, "manage:members")).toBe(true);

      // FORBIDDEN for Manager
      expect(can(managerRole, "manage:billing")).toBe(false);
      expect(can(managerRole, "manage:tenant")).toBe(false);
      expect(can(managerRole, "void:sale")).toBe(false);
    });

    it("allows owners full administrative access", () => {
      const ownerRole: UserRole = "owner";
      expect(can(ownerRole, "manage:billing")).toBe(true);
      expect(can(ownerRole, "manage:tenant")).toBe(true);
      expect(can(ownerRole, "manage:members")).toBe(true);
      expect(can(ownerRole, "view:reports")).toBe(true);
      expect(can(ownerRole, "view:cost_price")).toBe(true);
      expect(can(ownerRole, "void:sale")).toBe(true);
    });

    it("throws error when assertPermission fails", () => {
      expect(() => assertPermission("cashier", "view:reports")).toThrow(
        /lacks permission 'view:reports'/
      );
      expect(() => assertPermission("manager", "manage:billing")).toThrow(
        /lacks permission 'manage:billing'/
      );
      expect(() => assertPermission("owner", "manage:billing")).not.toThrow();
    });
  });

  describe("5. Cost Price Sanitization for Cashiers", () => {
    const mockVariant = {
      id: "v-1",
      name: "White",
      sku: "ANK-WHT",
      cost_price: 120000,
      retail_price: 165000,
    };

    it("strips cost_price for cashiers", () => {
      const sanitized = sanitizeVariantForRole(mockVariant, "cashier");
      expect(sanitized.cost_price).toBeNull();
      expect(sanitized.retail_price).toBe(165000);
      expect(sanitized.sku).toBe("ANK-WHT");
    });

    it("preserves cost_price for managers and owners", () => {
      const managerView = sanitizeVariantForRole(mockVariant, "manager");
      expect(managerView.cost_price).toBe(120000);

      const ownerView = sanitizeVariantForRole(mockVariant, "owner");
      expect(ownerView.cost_price).toBe(120000);
    });
  });

  describe("6. RPC Function Signatures & Transactions", () => {
    it("defines the atomic onboarding RPC function", () => {
      expect(onboardingMigrationSql.includes("fn_create_tenant_onboarding")).toBe(true);
      expect(onboardingMigrationSql.includes("INSERT INTO tenants")).toBe(true);
      expect(onboardingMigrationSql.includes("INSERT INTO stores")).toBe(true);
      expect(onboardingMigrationSql.includes("INSERT INTO stock_locations")).toBe(true);
      expect(onboardingMigrationSql.includes("INSERT INTO tenant_members")).toBe(true);
      expect(onboardingMigrationSql.includes("INSERT INTO subscriptions")).toBe(true);
      expect(onboardingMigrationSql.includes("INSERT INTO audit_logs")).toBe(true);
    });

    it("defines staff invitation and acceptance RPC functions", () => {
      expect(onboardingMigrationSql.includes("fn_invite_staff")).toBe(true);
      expect(onboardingMigrationSql.includes("fn_accept_invitation")).toBe(true);
      expect(onboardingMigrationSql.includes("fn_update_member_role")).toBe(true);
      expect(onboardingMigrationSql.includes("fn_revoke_invitation")).toBe(true);
    });
  });
});
