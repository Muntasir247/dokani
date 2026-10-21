import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Database Migrations & Seed Sanity Validation", () => {
  const migrationsDir = path.resolve(__dirname, "../supabase/migrations");
  const seedFile = path.resolve(__dirname, "../supabase/seed.sql");

  const migration1Content = fs.readFileSync(
    path.join(migrationsDir, "20261022000001_core_schema.sql"),
    "utf-8"
  );
  const migration2Content = fs.readFileSync(
    path.join(migrationsDir, "20261022000002_stock_ledger_views.sql"),
    "utf-8"
  );
  const seedContent = fs.readFileSync(seedFile, "utf-8");

  it("defines all required core schema tables in migration 1", () => {
    const requiredTables = [
      "tenants",
      "profiles",
      "tenant_members",
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

    for (const table of requiredTables) {
      expect(
        migration1Content.toLowerCase().includes(`create table if not exists ${table}`) ||
        migration1Content.toLowerCase().includes(`create table ${table}`)
      ).toBe(true);
    }
  });

  it("verifies multi-tenant columns exist on tenant-owned tables", () => {
    const tenantOwnedTables = [
      "tenant_members",
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

    for (const table of tenantOwnedTables) {
      // Find table definition chunk
      const tableRegex = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\);`, "i");
      const match = migration1Content.match(tableRegex);
      expect(match, `Table ${table} should match definition regex`).toBeTruthy();

      if (match) {
        const body = match[1].toLowerCase();
        expect(body.includes("tenant_id uuid not null references tenants(id)"), `${table} must have tenant_id FK`).toBe(true);
      }
    }
  });

  it("defines the ledger view and stock calculation functions in migration 2", () => {
    expect(migration2Content.includes("CREATE OR REPLACE VIEW view_current_stock")).toBe(true);
    expect(migration2Content.includes("CREATE OR REPLACE FUNCTION fn_get_stock_quantity")).toBe(true);
    expect(migration2Content.includes("CREATE OR REPLACE FUNCTION fn_has_sufficient_stock")).toBe(true);
  });

  it("verifies seed data contains at least 2 tenants and corresponding inventory records", () => {
    expect(seedContent.includes("Dhaka Gadget Hub")).toBe(true);
    expect(seedContent.includes("Bismillah Fashion")).toBe(true);
    expect(seedContent.includes("INSERT INTO stock_movements")).toBe(true);
    expect(seedContent.includes("INSERT INTO sales")).toBe(true);
  });

  it("verifies Step 3 migration 5 defines catalog extensions, serial sale lock, and stock RPCs", () => {
    const migration5Content = fs.readFileSync(
      path.join(migrationsDir, "20261022000005_catalog_and_inventory.sql"),
      "utf-8"
    );

    expect(migration5Content.includes("fn_check_serial_sale_rules")).toBe(true);
    expect(migration5Content.includes("trg_check_serial_sale_rules")).toBe(true);
    expect(migration5Content.includes("CREATE OR REPLACE VIEW view_supplier_balances")).toBe(true);
    expect(migration5Content.includes("CREATE OR REPLACE FUNCTION fn_receive_purchase")).toBe(true);
    expect(migration5Content.includes("CREATE OR REPLACE FUNCTION fn_adjust_stock")).toBe(true);
    expect(migration5Content.includes("CREATE OR REPLACE FUNCTION fn_stock_take")).toBe(true);
    expect(migration5Content.includes("CREATE OR REPLACE FUNCTION fn_transfer_stock")).toBe(true);
  });
});
