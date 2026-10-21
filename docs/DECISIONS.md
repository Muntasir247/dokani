# Architectural Decision Records (ADR) - Dokani

This document tracks major architectural decisions for **Dokani**, capturing the context, reasoning, and evaluated alternatives.

---

## ADR 001: Next.js App Router with TypeScript Strict Mode
* **Status**: Accepted
* **Date**: 2026-10-22
* **Context**: We need a full-stack web application framework that supports fast SSR, route handlers for offline sync, React Server Components (RSC), and standard PWA integration.
* **Decision**: Adopt Next.js 15 App Router with TypeScript strict mode enabled.
* **Why**:
  - Unified routing for both the POS client, merchant back-office, and API sync endpoints.
  - TypeScript strict ensures runtime boundaries (Zod + database types) remain leak-free.
  - Native cookie and header management tailored for Supabase SSR authentication.
* **Alternatives Rejected**:
  - *Vite + SPA + Express backend*: More moving parts, separate deployment pipelines, higher operational burden for a SaaS startup.
  - *Remix*: Smaller ecosystem in local BD deployment pipelines; Supabase SSR documentation and client integration is most mature on Next.js.

---

## ADR 002: Integer Minor Units (Poisha) for All Currency Storage
* **Status**: Accepted
* **Date**: 2026-10-22
* **Context**: Floating-point rounding inaccuracies in financial software lead to balance discrepancies, accounting errors, and customer disputes.
* **Decision**: Store all currency amounts (cost, price, discounts, taxes, payments, customer dues) as integer BigInt minor units (1 BDT = 100 Poisha).
* **Why**:
  - Eliminates IEEE 754 binary floating point representation issues (e.g. `0.1 + 0.2 = 0.30000000000000004`).
  - Native integers support exact sum aggregations and comparisons across Postgres, TypeScript, and IndexedDB.
* **Alternatives Rejected**:
  - *Floating point numbers (`DOUBLE PRECISION`)*: Unacceptable for financial ledgers due to precision loss.
  - *Postgres `MONEY` type*: Vendor-locked, poorly supported in client drivers and JSON serialization.
  - *Decimal strings in Javascript*: Higher memory overhead and requires third-party bignumber libraries for basic arithmetic.

---

## ADR 003: Append-Only Stock Movements for Inventory Truth
* **Status**: Accepted
* **Date**: 2026-10-22
* **Context**: Inventory counts must be resilient to concurrent sales, offline sync, theft audits, and multi-location transfers.
* **Decision**: Stock quantity is never represented as a mutable scalar column on `products` or `product_variants`. It is always derived from an immutable `stock_movements` ledger.
* **Why**:
  - Provides a permanent audit trail: every piece of inventory in the store has a traceable origin (purchase, return, adjustment, transfer).
  - Eliminates write-write conflicts during offline sales sync: each offline sale simply appends a negative movement rather than attempting to update a shared counter.
  - Simplifies shift reconciliations and variance investigations.
* **Alternatives Rejected**:
  - *Mutable `stock_quantity` column on `product_variants`*: High risk of lost updates and phantom inventory drift during offline syncing.
  - *Event sourcing with full event store*: Overly complex for small/medium retail shop needs; a simple append-only movement ledger is much more performant and queryable in Postgres.

---

## ADR 004: Multi-Tenancy via Shared Database and `tenant_id` Row-Level Isolation
* **Status**: Accepted
* **Date**: 2026-10-22
* **Context**: Dokani is a cost-effective SaaS targeting retail businesses in Bangladesh. Infrastructure costs must remain manageable while guaranteeing strict tenant isolation.
* **Decision**: Single shared Postgres database with explicit `tenant_id UUID` columns on all tenant-owned tables and composite indexes beginning with `tenant_id`. Row Level Security (RLS) policies will enforce isolation in Step 2.
* **Why**:
  - Efficient resource utilization on managed Supabase instances.
  - Seamless database migrations across all tenants simultaneously.
  - Strict composite indexing ensures sub-millisecond tenant partition queries.
* **Alternatives Rejected**:
  - *Database-per-tenant*: Unaffordable infrastructure costs for a multi-tenant SaaS with hundreds/thousands of retail shops.
  - *Schema-per-tenant*: Difficult to maintain and migrate at scale in Postgres; migration failures can leave schemas out of sync.

---

## ADR 005: Offline Synchronization via `sync_changes` Delta Journal & Idempotency Keys
* **Status**: Accepted
* **Date**: 2026-10-22
* **Context**: Retail shops in Bangladesh frequently suffer from intermittent or high-latency internet connectivity. Cashiers must continue scanning and printing receipts without blocking on network requests.
* **Decision**: Use a dedicated `sync_changes` delta journal table on the server to record inserts, updates, and deletes with monotonic versions. Client transactions generate client-side UUIDs and submit writes with idempotency keys.
* **Why**:
  - Allows client-side polling with high efficiency: `SELECT * FROM sync_changes WHERE updated_at > :last_sync`.
  - Idempotency keys prevent double billing or duplicate inventory deductions if a mobile network drops during response delivery.
* **Alternatives Rejected**:
  - *Full table dumps on every sync*: Bandwidth-heavy, drains mobile data, fails on 3G/slow connections.
  - *Distributed transactions (2PC)*: Impossible in offline or disconnected states.

---

## ADR 006: Row Level Security (RLS) Strategy & Immutability Guarantees
* **Status**: Accepted
* **Date**: 2026-10-22
* **Context**: We need non-negotiable multi-tenant isolation across all 24 database tables, role-based restrictions (owner, manager, cashier), and guarantee that ledger movements and audit logs can never be manipulated or deleted.
* **Decision**: Enable RLS on every table using `SECURITY DEFINER` helper functions (`is_tenant_member(tenant_id)` and `has_role(tenant_id, roles[])`). Omit `UPDATE` and `DELETE` policies on `stock_movements` and `audit_logs` to enforce strict append-only immutability.
* **Why**:
  - Eliminates reliance on client-side filtering; Postgres automatically filters every query by active tenant membership.
  - Cashiers are restricted at the database policy level from viewing expenses, supplier costs, or deleting sales.
  - Immutability of ledger and audit records ensures mathematical and financial integrity.
* **Alternatives Rejected**:
  - *Application-level where clauses only*: Extremely error-prone; a single missing `.eq('tenant_id', id)` in an endpoint creates critical cross-tenant data leaks.
  - *Triggers blocking updates on mutable tables*: Omitting `UPDATE`/`DELETE` policies directly under RLS is cleaner, more performant, and standard Postgres security practice.

---

## ADR 007: Atomic Tenant Onboarding & Staff Invitation Tokens
* **Status**: Accepted
* **Date**: 2026-10-22
* **Context**: When a shop owner registers, creating a store requires provisioning a tenant, an initial outlet branch, default stock locations, an owner role, and a default Free subscription without partial failure states.
* **Decision**: Implement `fn_create_tenant_onboarding` as a single atomic Postgres RPC transaction. Staff invitations use a dedicated `tenant_invitations` table with cryptographically secure random tokens and 7-day expiration.
* **Why**:
  - Guarantees complete atomicity: if any step fails (e.g., duplicate slug), the entire transaction rolls back.
  - Token-based invitations allow shop owners to invite cashiers and managers before they even sign up. When invited staff register or log in, `fn_accept_invitation` links them to the store automatically.
* **Alternatives Rejected**:
---

## ADR 008: Product Catalog, Stock Ledger Balances, Weighted-Average Cost (WAC), Serial Single-Sale Invariant, and Dry-Run CSV Validation
* **Status**: Accepted
* **Date**: 2026-10-22
* **Context**: Dokani's catalog & inventory management requires multi-variant products, tenant-scoped unique SKUs, append-only inventory ledger balance derivation, weighted-average cost (AVCO/WAC) tracking in integer poisha, single-sale database guarantees for serial numbers, role-based cost price masking for cashiers, and safe bulk CSV imports with row-level error reporting.
* **Decision**:
  1. **Stock on Hand Derived from Movements Ledger**: Balances are calculated by aggregating append-only `stock_movements` (purchases, sales, adjustments, transfers, returns). All stock changes occur through atomic Postgres RPCs (`fn_receive_purchase`, `fn_adjust_stock`, `fn_stock_take`, `fn_transfer_stock`).
  2. **Weighted-Average Cost (WAC)**: Updated on purchase receiving using integer poisha math: `new_wac = round((current_stock * current_wac + purchase_qty * purchase_unit_cost) / (current_stock + purchase_qty))`. When existing stock is zero or negative, the new purchase price resets the WAC. Inventory adjustments, cycle counts, and transfers preserve WAC.
  3. **DB-Level Single-Sale Serial Invariant**: A PostgreSQL `BEFORE INSERT OR UPDATE` trigger (`trg_check_serial_sale_rules` on `product_serials`) verifies that `times_sold` cannot exceed 1 and forbids setting status to 'sold' if already sold. A serial can never be sold twice, preventing race conditions during offline sync or concurrent POS checkout.
  4. **Two-Stage CSV Import with Dry-Run Validation**: Bulk CSV uploads run in `dryRun` mode first. Row and column validation parses numbers, checks SKU tenant uniqueness, and collects row-specific errors. The server imports zero rows if `errorCount > 0` or `dryRun = true`.
  5. **Cashier Cost Masking**: Role enforcement at the API layer strips `cost_price` (returns `null`) for cashiers, ensuring privacy of supplier profit margins at the shop floor.
* **Why**:
  - Guarantees financial and physical inventory reconciliation: stock on hand is mathematically proven to equal ledger movements.
  - Prevents high-value gadget/electronics fraud or double-selling under intermittent network connectivity.
  - Zero floating-point rounding errors across inventory turnover.
* **Alternatives Rejected**:
  - *Mutable stock counter column on product_variants*: Prone to drift, phantom stock, and untraceable shrinkage.
  - *Application-only serial uniqueness check*: Fails under race conditions or delayed offline-sync reconciliations.
  - *Allowing partial CSV imports*: Incomplete imports leave messy half-configured catalogs with broken variant or category links.

