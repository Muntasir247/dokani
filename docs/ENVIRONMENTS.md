# Dokani Environment Strategy & Migration Rollback Guide

## 1. Environments Topology

Dokani is deployed across three distinct, isolated lifecycle tiers:

| Tier | Purpose | Database | Base URL | Seed Data Allowed? |
| :--- | :--- | :--- | :--- | :--- |
| **Local** | Developer workstation | Docker / Supabase CLI | `http://localhost:3000` | **Yes** (`npm run seed`) |
| **Staging** | CI pre-flight, QA, client demo | Managed Supabase Staging | `https://staging.dokani.app` | **Yes** (Automated sandbox reset) |
| **Production** | Live tenant operations | Managed Supabase HA Cluster | `https://dokani.app` | **NO** (Strictly blocked) |

---

## 2. Environment Variables & Secret Configuration

| Variable | Required In | Sensitivity | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | All | Public | URL of the Supabase PostgreSQL API endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Public | Client anonymous key with strict RLS enforcement |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-Only | **CRITICAL** | Bypasses RLS. Used only in RPCs, billing, and webhooks |
| `COURIER_ENCRYPTION_KEY` | Server-Only | **CRITICAL** | Exactly 32 bytes (256-bit) master key for AES-256-GCM |
| `SSLCOMMERZ_STORE_ID` / `_PASSWD` | Server-Only | High | Merchant credentials for Bangladesh payment gateway |
| `BKASH_APP_KEY` / `_SECRET` | Server-Only | High | bKash tokenized payment checkout credentials |
| `SENTRY_DSN` | Server-Only | Moderate | Error and exception tracking correlation DSN |

---

## 3. Seed Data Isolation Policy

To prevent test records from contaminating live multi-tenant accounts:
1. **Runtime Guard**: `src/lib/config/env.ts` and all seed scripts check:
   ```ts
   if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
     throw new Error("FATAL: Database seeding is forbidden in production environments.");
   }
   ```
2. **Deterministic Test IDs**: Seed scripts use dedicated UUID v4 fixtures (`00000000-0000-0000-0000-000000000001`) that are easily identified and excluded from operational metrics.

---

## 4. Migration Strategy & Rollback Playbooks

Dokani enforces **Zero-Downtime Forward Migrations**. Columns are never dropped or destructively renamed in a single release. 

### Migration Registry (000001 - 000011)

| Version | Migration Name | Rollback Strategy |
| :--- | :--- | :--- |
| **000001** | `core_schema` | Core tables (`tenants`, `profiles`, `stores`, `products`). Rollback requires restoring snapshot. |
| **000002** | `indexes_and_constraints` | Drop performance indexes (`DROP INDEX CONCURRENTLY IF EXISTS ...`). |
| **000003** | `rls_policies` | Alter tables to disable RLS or drop individual tenant isolation policies. |
| **000004** | `pos_sales_and_stock_rpcs` | Drop RPCs (`DROP FUNCTION IF EXISTS fn_create_pos_sale(...)`). |
| **000005** | `offline_sync_and_outbox` | Drop `sync_changes` and `tenant_devices` tables; drop notify triggers. |
| **000006** | `receipts_invoices_dues` | Drop `customer_payments` table and `fn_collect_due_payment`. |
| **000007** | `saas_billing_and_plans` | Drop `subscriptions`, `subscription_invoices`, `payment_webhooks_log`. |
| **000008** | `analytics_reports_and_shifts`| Drop views, `cash_drawer_sessions`, `daily_sales_aggregates`. |
| **000009** | `notifications_and_alerts` | Drop `notifications` table and alert dispatch RPCs. |
| **000010** | `performance_and_benchmarks`| Drop partitioned aggregate indexes. |
| **000011** | `integrations_security_webhooks`| Drop `shipments`, `tenant_courier_configs`, `tenant_api_keys`, `webhook_deliveries`. |

### Standard Emergency Rollback Procedure
If a production migration causes an unexpected lock or schema mismatch:
```bash
# 1. Inspect active database locks
psql "$DATABASE_URL" -c "
  SELECT pid, age(clock_timestamp(), query_start), usename, query 
  FROM pg_stat_activity 
  WHERE state != 'idle' AND query NOT ILIKE '%pg_stat_activity%' 
  ORDER BY query_start ASC;
"

# 2. Terminate blocking lock if necessary
psql "$DATABASE_URL" -c "SELECT pg_terminate_backend(<blocking_pid>);"

# 3. Apply targeted reverse patch (e.g. migration 11 rollback)
psql "$DATABASE_URL" -c "
  DROP TABLE IF EXISTS webhook_deliveries CASCADE;
  DROP TABLE IF EXISTS tenant_webhook_endpoints CASCADE;
  DROP TABLE IF EXISTS tenant_api_keys CASCADE;
  DROP TABLE IF EXISTS shipments CASCADE;
  DROP TABLE IF EXISTS tenant_courier_configs CASCADE;
  ALTER TABLE tenants DROP COLUMN IF EXISTS deletion_scheduled_at;
  ALTER TABLE tenants DROP COLUMN IF EXISTS retention_purge_after;
"
```
