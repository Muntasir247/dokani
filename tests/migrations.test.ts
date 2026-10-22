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

  it("verifies Step 4 migration 6 defines POS sales RPCs, sequential invoice sequences, returns, and void", () => {
    const migration6Content = fs.readFileSync(
      path.join(migrationsDir, "20261022000006_pos_and_sales.sql"),
      "utf-8"
    );

    expect(migration6Content.includes("branch_invoice_sequences")).toBe(true);
    expect(migration6Content.includes("return_items")).toBe(true);
    expect(migration6Content.includes("customer_payments")).toBe(true);
    expect(migration6Content.includes("view_customer_balances")).toBe(true);
    expect(migration6Content.includes("CREATE OR REPLACE FUNCTION fn_create_sale")).toBe(true);
    expect(migration6Content.includes("CREATE OR REPLACE FUNCTION fn_return_sale")).toBe(true);
    expect(migration6Content.includes("CREATE OR REPLACE FUNCTION fn_void_sale")).toBe(true);
  });

  it("verifies Step 5 migration 7 defines offline sync, tenant_devices, offline_invoice_number, and negative stock support", () => {
    const migration7Content = fs.readFileSync(
      path.join(migrationsDir, "20261022000007_offline_sync.sql"),
      "utf-8"
    );

    expect(migration7Content.includes("offline_invoice_number")).toBe(true);
    expect(migration7Content.includes("tenant_devices")).toBe(true);
    expect(migration7Content.includes("CREATE OR REPLACE FUNCTION fn_revoke_device")).toBe(true);
    expect(migration7Content.includes("p_is_offline_sync")).toBe(true);
    expect(migration7Content.includes("alert:negative_stock")).toBe(true);
  });

  it("verifies Step 6 migration 8 defines store settings, customer tiers, dues collection RPC, and public invoice token", () => {
    const migration8Content = fs.readFileSync(
      path.join(migrationsDir, "20261022000008_receipts_dues_and_settings.sql"),
      "utf-8"
    );

    expect(migration8Content.includes("vat_bin_number")).toBe(true);
    expect(migration8Content.includes("default_paper_size")).toBe(true);
    expect(migration8Content.includes("price_tier")).toBe(true);
    expect(migration8Content.includes("share_token")).toBe(true);
    expect(migration8Content.includes("CREATE OR REPLACE FUNCTION fn_collect_due_payment")).toBe(true);
    expect(migration8Content.includes("CREATE OR REPLACE FUNCTION fn_lookup_warranty")).toBe(true);
    expect(migration8Content.includes("CREATE OR REPLACE FUNCTION fn_get_public_invoice")).toBe(true);
    expect(migration8Content.includes("sales_public_read")).toBe(true);
  });

  it("verifies Step 7 migration 9 defines billing, subscription invoices, webhooks log, and admin RPCs", () => {
    const migration9Content = fs.readFileSync(
      path.join(migrationsDir, "20261022000009_billing_plans_and_subscriptions.sql"),
      "utf-8"
    );

    expect(migration9Content.includes("is_super_admin")).toBe(true);
    expect(migration9Content.includes("subscription_invoices")).toBe(true);
    expect(migration9Content.includes("payment_webhooks_log")).toBe(true);
    expect(migration9Content.includes("trial_ends_at")).toBe(true);
    expect(migration9Content.includes("grace_period_ends_at")).toBe(true);
    expect(migration9Content.includes("CREATE OR REPLACE FUNCTION fn_check_plan_limits")).toBe(true);
    expect(migration9Content.includes("CREATE OR REPLACE FUNCTION fn_record_subscription_payment")).toBe(true);
    expect(migration9Content.includes("CREATE OR REPLACE FUNCTION fn_admin_extend_trial")).toBe(true);
    expect(migration9Content.includes("CREATE OR REPLACE FUNCTION fn_admin_set_plan")).toBe(true);
  });

  it("verifies Step 8 migration 10 defines shifts, daily aggregates, valuation view, notifications, and analytics RPCs", () => {
    const migration10Content = fs.readFileSync(
      path.join(migrationsDir, "20261022000010_analytics_reports_and_shifts.sql"),
      "utf-8"
    );

    expect(migration10Content.includes("cash_drawer_sessions")).toBe(true);
    expect(migration10Content.includes("cash_drawer_transactions")).toBe(true);
    expect(migration10Content.includes("daily_sales_aggregates")).toBe(true);
    expect(migration10Content.includes("notifications")).toBe(true);
    expect(migration10Content.includes("view_inventory_valuation")).toBe(true);
    expect(migration10Content.includes("CREATE OR REPLACE FUNCTION fn_recompute_daily_sales_aggregate")).toBe(true);
    expect(migration10Content.includes("CREATE OR REPLACE FUNCTION fn_get_dashboard_analytics")).toBe(true);
    expect(migration10Content.includes("CREATE OR REPLACE FUNCTION fn_get_dead_stock")).toBe(true);
    expect(migration10Content.includes("CREATE OR REPLACE FUNCTION fn_get_customer_aging")).toBe(true);
    expect(migration10Content.includes("CREATE OR REPLACE FUNCTION fn_open_cash_drawer")).toBe(true);
    expect(migration10Content.includes("CREATE OR REPLACE FUNCTION fn_add_cash_drawer_tx")).toBe(true);
    expect(migration10Content.includes("CREATE OR REPLACE FUNCTION fn_close_cash_drawer")).toBe(true);
  });

  it("verifies Step 9 migration 11 defines courier configs, shipments with duplicate guard, api keys, webhooks, and retention deletion", () => {
    const migration11Content = fs.readFileSync(
      path.join(migrationsDir, "20261022000011_integrations_security_and_webhooks.sql"),
      "utf-8"
    );

    expect(migration11Content.includes("tenant_courier_configs")).toBe(true);
    expect(migration11Content.includes("shipments")).toBe(true);
    expect(migration11Content.includes("idx_unique_active_sale_shipment")).toBe(true);
    expect(migration11Content.includes("tenant_api_keys")).toBe(true);
    expect(migration11Content.includes("tenant_webhook_endpoints")).toBe(true);
    expect(migration11Content.includes("webhook_deliveries")).toBe(true);
    expect(migration11Content.includes("deletion_scheduled_at")).toBe(true);
    expect(migration11Content.includes("retention_purge_after")).toBe(true);
    expect(migration11Content.includes("CREATE OR REPLACE FUNCTION fn_schedule_tenant_deletion")).toBe(true);
    expect(migration11Content.includes("CREATE OR REPLACE FUNCTION fn_cancel_tenant_deletion")).toBe(true);
  });
});
