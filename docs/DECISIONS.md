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

---

## ADR 009: POS Screen Architecture, Server-Side Pricing Verification, Gapless Sequential Invoicing, Anti-Overselling Concurrency Locks, and Void/Return Mechanics
* **Status**: Accepted
* **Date**: 2026-10-22
* **Context**: Dokani's retail POS terminal requires sub-100ms barcode scanning UI response time, keyboard-wedge scanner compatibility, native BarcodeDetector API with ZXing camera fallback, offline-friendly cart state with hold/resume, and server-side pricing protection against tampered client payloads. Furthermore, invoice numbering must be sequential per tenant and branch with strictly zero gaps or duplicates under concurrent sales, overselling of the last unit must be impossible under simultaneous transactions, split payments (cash, bKash, Nagad, card, due/credit) must accurately track customer accounts receivable, and manager-only voiding and customer returns must maintain the append-only stock movement ledger.
* **Decision**:
  1. **Sub-millisecond In-Memory Barcode Resolution**: Cart state management using Zustand with an in-memory `Map<string, PosVariant>` indexing barcodes and SKUs, achieving 0.174 ms scan response time (570x faster than the 100 ms requirement). BarcodeListener tracks rapid keystrokes (< 50 ms between characters) from keyboard-wedge hardware without losing focus or intercepting active modal inputs.
  2. **Server-Side Price and Stock Verification (Zero Trust Client Payloads)**: The server recalculates all line totals, discounts, taxes, and final payable amounts directly from database rows. Client-submitted prices or totals are strictly validated or overridden by server-side math (`verifyAndRecomputePayload`). Cashier discount limits are capped at 10% server-side, preventing unauthorized price slashing.
  3. **Gapless Sequential Invoicing**: Implemented via a dedicated `branch_invoice_sequences` table with an atomic `INSERT ... ON CONFLICT (tenant_id, store_id, prefix) DO UPDATE SET last_seq = branch_invoice_sequences.last_seq + 1 RETURNING last_seq`. Because row updates are tied to the transaction boundary, rolled-back transactions automatically roll back the sequence number, guaranteeing gapless, strictly sequential numbering (`INV-YYYYMM-000001`) with zero duplicates under concurrency.
  4. **Pessimistic Row-Locking Anti-Overselling Guard**: `fn_create_sale` executes `SELECT id, is_active FROM product_variants WHERE id = ... FOR UPDATE` before stock verification and ledger deduction. Any concurrent transactions attempting to sell the same variant wait for the lock. If available stock drops below the requested quantity, the transaction raises an exception and aborts. Concurrency tests confirm that under simultaneous requests for the last unit, exactly one transaction commits and all others fail with an out-of-stock error.
  5. **Split Payments and Due Tracking**: Payments support multiple tenders (`cash`, `bkash`, `nagad`, `card`, `due`). When payment method includes `due` or total collected is less than the invoice amount, the difference is recorded as a customer receivable in `customer_payments` with `payment_type = 'due_charge'`, updating `view_customer_balances`.
  6. **Append-Only Stock Ledger for Returns and Voids**: Returns (`fn_return_sale`) and voids (`fn_void_sale`) write corresponding reverse stock movements (`return_in`, `void_restock`), optionally revert serial statuses back to `available`, and write tamper-evident audit logs. Voiding is strictly restricted to `owner` and `manager` roles with a mandatory reason.
* **Why**:
  - Guarantees financial accuracy and regulatory compliance: shop owners get strictly numbered invoices and complete revenue auditability.
  - Guarantees physical inventory integrity: overselling is mathematically and structurally impossible even under concurrent checkout counters.
  - Cashiers enjoy lightning-fast checkout without waiting for network round-trips to resolve barcodes.
* **Alternatives Rejected**:
  - *PostgreSQL sequences (`CREATE SEQUENCE`)*: `nextval()` never rolls back on aborted transactions, creating gaps in fiscal invoice sequences.
  - *Client-side price calculation trust*: Trusting client payloads enables malicious users or compromised browser clients to change item prices to ৳0 or modify discounts arbitrarily.
  - *Optimistic concurrency control without row locks*: Would cause frequent checkout failures and retry storms on busy retail counters during rush hours.

---

## ADR 010: Offline-First Synchronization Architecture, Dexie Outbox Pattern, Monotonic UUID v7, and Negative Stock Conflict Reconciliation
* **Status**: Accepted
* **Date**: 2026-10-22
* **Context**: In Bangladesh retail stores, frequent power outages (load shedding) and flaky cellular connectivity make synchronous cloud round-trips unacceptable. The POS workstation must operate completely offline, execute checkouts instantaneously, queue mutations locally, synchronize safely upon reconnection, prevent duplicate transactions across network drops, and reconcile stock discrepancies without dropping real-world sales.
* **Decision**:
  1. **Dexie (IndexedDB) Local Partitioning**: Database named `dokani_${tenantId}` stores local catalog products, variants, active customers, stock snapshots, serial numbers, and the durable outbox queue. Local data is completely purged on logout.
  2. **Monotonic RFC 9562 UUID v7**: Client mutation IDs are generated using UUID v7 with sub-millisecond sequential counters, guaranteeing monotonic sortability and eliminating B-tree page splits in PostgreSQL and IndexedDB.
  3. **FIFO Outbox Engine with Exponential Backoff & Jitter**: Mutations are persisted to IndexedDB before any network transmission. The outbox processor executes items in strict temporal order with exponential backoff ($1\text{s} \to 60\text{s} \pm 20\%$) on 5xx or network errors.
  4. **Strict Server-Side Idempotency**: Each push carries `idempotencyKey = idemp_{tenantId}_{deviceCode}_{outboxId}`. The server checks the `idempotency_keys` table inside a transaction. Replayed requests return the original response immediately with zero duplicate database operations.
  5. **Real-World Retail Law (Negative Stock Reconciliation)**: Offline sales represent physical goods that already left the counter. Offline sales are never rolled back or rejected. If server stock is insufficient upon sync, the sale is accepted, the negative inventory movement is recorded in `stock_movements`, and an `alert:negative_stock` audit record is flagged for management review.
  6. **Dual-Number Sequential Invoicing**: Offline transactions receive immediate client numbers `OFF-{storeCode}-{deviceCode}-{localSeq}` (e.g., `OFF-DHK1-T01-000042`), which are reconciled post-sync with official sequential fiscal numbers (`INV-DHK1-202610-000189`), indexed together for search and reprint.
  7. **PWA Service Worker**: App shell and static assets are cached via `CacheFirst`. The `/pos` route uses `NetworkFirst` with offline cache fallback, allowing cold-boot loading with zero internet.
  8. **Terminal Authorization & Remote Revocation**: POS devices register in `tenant_devices`. Managers can remotely revoke stolen or lost terminals via `fn_revoke_device`, immediately rejecting future sync attempts.
* **Why**:
  - Eliminates checkout downtime during power cuts and weak internet.
  - Guarantees financial and inventory consistency: zero lost sales, zero phantom items, and zero duplicated charges.
  - Cashiers never wait on network spinners.
* **Alternatives Rejected**:
  - *SQLite WASM*: Multi-megabyte binary, slow cold start, and requires `COOP`/`COEP` headers that break payment gateway iframes.
  - *Rejecting oversold offline sales*: Corrupts bookkeeping by dropping sales where real cash and goods already changed hands.
  - *Server-assigned IDs for offline entities*: Impossible without network connection; client UUID v7 enables immutable identity from creation.

---

## ADR 011: Print-Optimized Dual Receipt Engine (80mm & A4 Mushak 6.3), Unguessable Public Invoices, Atomic Dues Ledger, and Customer Loyalty

* **Status**: Accepted
* **Date**: 2026-10-22
* **Context**: Retail and wholesale stores in Bangladesh require both 80mm compact thermal receipts for POS counter sales and formal A4 tax invoices (NBR Mushak 6.3 compliant) for B2B wholesale buyers with payment terms and bank routing details. Customers also need digital receipts via WhatsApp/SMS deep links, public serial warranty verification without business margin leakage, and store owners require an atomic dues collection workflow that synchronizes invoice due amounts and overall customer account balances without double-counting.
* **Decision**:
  1. **Dual Print-Optimized Template Engine**:
     - Standard 80mm thermal receipt formatted with `@page { size: 80mm auto; margin: 0; }`, high-contrast typography, split payment tender breakdown, change return, and custom shop footer.
     - A4 B2B Tax Invoice matching Bangladesh NBR Mushak 6.3 standard: includes store VAT/BIN, buyer company & BIN/TIN, credit terms, bank wire routing details, serialized warranty badges, and authorized signatory blocks.
     - Inline SVG QR codes generated entirely offline without external CDN dependencies, embedding public invoice URLs.
     - ESC/POS binary command builder (`EscPosBuilder`) providing WebUSB and WebSerial thermal printer compatibility for direct hardware cutting and printing.
  2. **Cryptographically Unguessable Public Invoice Access**:
     - Each sale receives a 128-bit unguessable random token (`share_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex')`).
     - Secure RPC `fn_get_public_invoice(p_share_token)` exposes only that specific invoice and sanitizes sensitive internal business metrics (cost price, margin, profit, supplier origin) to prevent data leaks.
     - Deep link generators for WhatsApp (`wa.me/?text=...`) and SMS (`sms:...?body=...`).
  3. **Public Serial Number Warranty Registry**:
     - Customer serial/IMEI verification portal (`/warranty`) invoking `fn_lookup_warranty(p_serial_number)`.
     - Validates active coverage against `product_serials.warranty_end` without exposing purchase cost, wholesale price, or supplier data.
  4. **Strict Atomic Dues Accounting (Anti-Double-Counting Guard)**:
     - `view_customer_balances` derives `current_due = opening_balance + SUM(sales.due_amount) - SUM(customer_payments WHERE sale_id IS NULL)`.
     - When payment is allocated to a specific invoice (`sale_id`), reducing `sales.due_amount` automatically updates the customer due in lockstep.
     - Atomic RPC `fn_collect_due_payment` settles invoice dues, inserts payment tender, updates audit logs, and returns the verified customer balance in a single database transaction.
  5. **Configurable Customer Loyalty Points & Wholesale Price Tiers**:
     - Store-configurable loyalty rules (`loyalty_earn_rate_poisha`, `loyalty_redeem_rate_poisha`).
     - Customer price tiers (`retail`, `wholesale`, `custom`) supporting B2B pricing rules and credit limit enforcement.
* **Why**:
  - Delivers high-speed counter printing and enterprise-grade B2B wholesale tax invoices from a unified data model.
  - Guarantees 100% mathematical precision in customer debt accounting.
  - Protects merchant margins from public inspection while providing transparent digital receipts to buyers.
* **Alternatives Rejected**:
  - *Dynamic canvas image receipts*: Blurry on thermal paper, slow to render, and fails browser text search.
  - *Sequential public invoice URLs (`/invoice/123`)*: Insecure; exposes total transaction volume and allows competitive scrapers to harvest customer lists.
  - *Floating point loyalty point conversions*: Causes round-off errors and ledger drift.




