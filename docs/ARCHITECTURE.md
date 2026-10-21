# Dokani - System Architecture & Database Design

This document details the core database architecture, multi-tenancy model, and ledger-based inventory system powering **Dokani**, an offline-first Point-of-Sale SaaS tailored for retail businesses in Bangladesh.

---

## 1. Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    TENANTS ||--o{ STORES : owns
    TENANTS ||--o{ TENANT_MEMBERS : employs
    TENANTS ||--o{ SUBSCRIPTIONS : billed_under
    TENANTS ||--o{ CATEGORIES : categorizes
    TENANTS ||--o{ BRANDS : labels
    TENANTS ||--o{ PRODUCTS : catalogs
    TENANTS ||--o{ CUSTOMERS : serves
    TENANTS ||--o{ SUPPLIERS : procures_from
    TENANTS ||--o{ PURCHASES : receives
    TENANTS ||--o{ SALES : transactions
    TENANTS ||--o{ STOCK_MOVEMENTS : ledger
    TENANTS ||--o{ EXPENSES : logs
    TENANTS ||--o{ SYNC_CHANGES : tracks

    PROFILES ||--o{ TENANT_MEMBERS : assigned
    PROFILES ||--o{ SALES : rings_up

    STORES ||--o{ STOCK_LOCATIONS : contains
    STORES ||--o{ PURCHASES : receives_at
    STORES ||--o{ SALES : originates

    PRODUCTS ||--o{ PRODUCT_VARIANTS : has
    PRODUCT_VARIANTS ||--o{ PRODUCT_SERIALS : tracks
    PRODUCT_VARIANTS ||--o{ PURCHASE_ITEMS : purchased_in
    PRODUCT_VARIANTS ||--o{ SALE_ITEMS : sold_in
    PRODUCT_VARIANTS ||--o{ STOCK_MOVEMENTS : affects

    STOCK_LOCATIONS ||--o{ STOCK_MOVEMENTS : stationed_at
    STOCK_LOCATIONS ||--o{ PRODUCT_SERIALS : stored_at

    PURCHASES ||--o{ PURCHASE_ITEMS : contains
    SALES ||--o{ SALE_ITEMS : contains
    SALES ||--o{ SALE_PAYMENTS : paid_by
    SALES ||--o{ RETURNS : refunded_by

    TENANTS {
        uuid id PK
        string name
        string slug UK
        string currency
        string timezone
    }

    STORES {
        uuid id PK
        uuid tenant_id FK
        string name
        string code
        boolean is_main
    }

    STOCK_LOCATIONS {
        uuid id PK
        uuid tenant_id FK
        uuid store_id FK
        string name
        boolean is_default
    }

    PRODUCTS {
        uuid id PK
        uuid tenant_id FK
        string name
        boolean has_variants
        boolean has_serials
        string unit
    }

    PRODUCT_VARIANTS {
        uuid id PK
        uuid tenant_id FK
        uuid product_id FK
        string sku UK
        string barcode
        bigint cost_price
        bigint retail_price
        numeric tax_rate
        int reorder_point
    }

    STOCK_MOVEMENTS {
        uuid id PK
        uuid tenant_id FK
        uuid location_id FK
        uuid variant_id FK
        enum type
        int quantity
        bigint unit_cost
        uuid reference_id
        string reference_type
    }

    SALES {
        uuid id PK
        uuid tenant_id FK
        uuid store_id FK
        uuid customer_id FK
        uuid cashier_id FK
        string invoice_number UK
        bigint total_amount
        bigint paid_amount
        bigint due_amount
    }

    SALE_ITEMS {
        uuid id PK
        uuid tenant_id FK
        uuid sale_id FK
        uuid variant_id FK
        int quantity
        bigint unit_price
        bigint unit_cost
    }

    SALE_PAYMENTS {
        uuid id PK
        uuid tenant_id FK
        uuid sale_id FK
        enum method
        bigint amount
        string reference
    }
```

---

## 2. Multi-Tenancy Architecture

### 2.1 Shared-Database, Row-Partitioned Model
Dokani operates on a single Postgres database with tenant isolation enforced strictly at the row level:
- **`tenant_id` on Every Table**: Every tenant-owned table explicitly includes a non-null `tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`.
- **Composite Indexing**: High-cardinality queries always feature `tenant_id` as the leading column in composite indexes (e.g. `(tenant_id, barcode)`, `(tenant_id, sku)`, `(tenant_id, sold_at DESC)`).
- **Tenant Context**: In application requests, user identity is mapped to tenant membership via `tenant_members(tenant_id, user_id)`. RLS policies in Step 2 enforce that no query can bypass `tenant_id = auth.current_tenant_id()`. Client-side filters are never trusted for tenant isolation.

### 2.2 Soft Deletion & Audit Trail
- Every tenant table contains `deleted_at TIMESTAMPTZ`, allowing safe undo operations, historic audit reports, and clean tombstones during offline synchronization.
- Sensitive state changes are logged to `audit_logs` capturing `actor_id`, `old_values`, and `new_values`.

---

## 3. Inventory as an Append-Only Ledger

### 3.1 Why Not a Mutable `quantity` Column?
Traditional POS systems that execute `UPDATE products SET stock = stock - 1` suffer from:
1. **Lost Updates & Race Conditions**: Two cashiers selling the same item offline or concurrently create inconsistent counts.
2. **Zero Auditability**: If the stock count is wrong, it is impossible to determine whether the cause was theft, missed deliveries, unrecorded returns, or software bugs.
3. **Complex Sync Merges**: Merging conflicting scalar numbers across offline clients is prone to silent inventory loss.

### 3.2 Dokani's Ledger Engine (`stock_movements`)
In Dokani, current stock is **never a raw mutable column**. It is always dynamically derived from the immutable `stock_movements` table:
$$\text{Current Stock} = \sum_{\text{movements}} \text{quantity}$$

#### Movement Types:
- `purchase`: $+Q$ (Inbound stock from supplier invoices)
- `sale`: $-Q$ (Outbound stock decremented upon invoice completion)
- `return`: $+Q$ (Customer returns item back to stock)
- `adjustment`: $\pm Q$ (Physical inventory audit adjustments with audit notes)
- `transfer_in`: $+Q$ (Inter-store stock arrival)
- `transfer_out`: $-Q$ (Inter-store stock dispatch)

#### Performance Optimization (`view_current_stock`):
- Aggregates are computed via indexed groupings on `(tenant_id, location_id, variant_id)`.
- Materialized views or cached snapshot ledgers can be triggered periodically for high-volume stores without compromising the single source of truth.

---

## 4. Financial Calculations: Minor Units (Poisha)

All monetary values (`cost_price`, `retail_price`, `wholesale_price`, `subtotal`, `tax_amount`, `paid_amount`, `due_amount`, `credit_limit`) are stored strictly as **64-bit BigInt integer minor units** (1 BDT = 100 Poisha).
- Floating-point representations (`float`, `double`) are banned to eliminate rounding drift (`0.1 + 0.2 !== 0.3`).
- Display formatting (`৳1,650.00`) is handled in presentation layers using standard `Intl.NumberFormat` localized for Bangladesh.

---

## 5. Offline Sync Primitives

1. **`sync_changes` Table**: An append-only delta journal capturing `(tenant_id, table_name, record_id, op, record_version, updated_at)`. When an offline POS client reconnects, it queries `sync_changes` where `updated_at > last_sync_time`.
2. **`idempotency_keys` Table**: Prevents double-billing or duplicate stock movements when weak mobile networks cause retransmitted POS transactions.
3. **Monotonic `version` Counters**: Every row increments its `version` integer on update, enabling deterministic Last-Write-Wins (LWW) or conflict detection.
