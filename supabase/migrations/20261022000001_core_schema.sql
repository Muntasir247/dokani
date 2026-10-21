-- =============================================================================
-- Migration: 20261022000001_core_schema.sql
-- Description: Core database schema for Dokani (Multi-tenant POS SaaS)
-- Tables: tenants, profiles, tenant_members, subscriptions, stores,
--         categories, brands, products, product_variants, product_serials,
--         stock_locations, stock_movements, customers, suppliers,
--         sales, sale_items, sale_payments, purchases, purchase_items,
--         returns, expenses, audit_logs, sync_changes, idempotency_keys
-- NOTE: RLS policies are intentionally omitted here and will be added in Step 2.
-- =============================================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('owner', 'manager', 'cashier');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE plan_tier AS ENUM ('free', 'pro', 'business');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE serial_status AS ENUM ('available', 'reserved', 'sold', 'returned', 'rma');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE movement_type AS ENUM ('purchase', 'sale', 'return', 'adjustment', 'transfer_in', 'transfer_out');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('cash', 'bkash', 'nagad', 'card', 'due');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sync_op AS ENUM ('INSERT', 'UPDATE', 'DELETE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Tenants & Profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    currency VARCHAR(10) NOT NULL DEFAULT 'BDT',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Dhaka',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY, -- References auth.users(id) in Supabase
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tenant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'cashier',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT uq_tenant_member UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_tier plan_tier NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active', -- active, past_due, canceled
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    current_period_end TIMESTAMPTZ,
    max_stores INTEGER NOT NULL DEFAULT 1,
    max_products INTEGER NOT NULL DEFAULT 200,
    max_staff INTEGER NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1
);

-- -----------------------------------------------------------------------------
-- 3. Outlets & Inventory Locations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code VARCHAR(50) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    is_main BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT uq_store_code_per_tenant UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS stock_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT uq_location_name_per_store UNIQUE (tenant_id, store_id, name)
);

-- -----------------------------------------------------------------------------
-- 4. Catalog: Categories, Brands, Products, Variants, Serials
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT uq_category_slug_per_tenant UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT uq_brand_name_per_tenant UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    has_variants BOOLEAN NOT NULL DEFAULT false,
    has_serials BOOLEAN NOT NULL DEFAULT false,
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Standard',
    sku VARCHAR(100) NOT NULL,
    barcode VARCHAR(100),
    cost_price BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha), e.g. 10000 = 100.00 BDT
    retail_price BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    wholesale_price BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00, -- e.g. 5.00 for 5% VAT
    reorder_point INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT uq_variant_sku_per_tenant UNIQUE (tenant_id, sku)
);

CREATE TABLE IF NOT EXISTS product_serials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    stock_location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
    serial_number VARCHAR(100) NOT NULL,
    status serial_status NOT NULL DEFAULT 'available',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT uq_serial_per_variant UNIQUE (tenant_id, variant_id, serial_number)
);

-- -----------------------------------------------------------------------------
-- 5. Business Contacts: Customers & Suppliers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone VARCHAR(50),
    email TEXT,
    address TEXT,
    credit_limit BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    opening_balance BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha; positive = receivable)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    company TEXT,
    phone VARCHAR(50),
    email TEXT,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1
);

-- -----------------------------------------------------------------------------
-- 6. Purchases & Incoming Stock
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    invoice_number VARCHAR(100) NOT NULL,
    purchase_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_cost BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    paid_amount BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT uq_purchase_invoice_per_tenant UNIQUE (tenant_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0), -- Minor units (poisha)
    subtotal BIGINT NOT NULL CHECK (subtotal >= 0), -- Minor units (poisha)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1
);

-- -----------------------------------------------------------------------------
-- 7. Sales, Items, & Payments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    cashier_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    invoice_number VARCHAR(100) NOT NULL,
    subtotal BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    discount_amount BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    tax_amount BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    total_amount BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    paid_amount BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    due_amount BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    change_amount BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    notes TEXT,
    sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT uq_sale_invoice_per_tenant UNIQUE (tenant_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price BIGINT NOT NULL CHECK (unit_price >= 0), -- Minor units (poisha)
    unit_cost BIGINT NOT NULL DEFAULT 0, -- Snapshot of COGS in poisha
    discount_amount BIGINT NOT NULL DEFAULT 0,
    tax_amount BIGINT NOT NULL DEFAULT 0,
    subtotal BIGINT NOT NULL CHECK (subtotal >= 0), -- Minor units (poisha)
    serial_numbers TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sale_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    method payment_method NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0), -- Minor units (poisha)
    reference VARCHAR(100), -- TrxID for bKash/Nagad, last 4 card digits, etc.
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    return_number VARCHAR(100) NOT NULL,
    refund_amount BIGINT NOT NULL DEFAULT 0, -- Minor units (poisha)
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT uq_return_number_per_tenant UNIQUE (tenant_id, return_number)
);

-- -----------------------------------------------------------------------------
-- 8. Append-Only Stock Movements (The Inventory Ledger)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    type movement_type NOT NULL,
    quantity INTEGER NOT NULL, -- Positive for additions (purchase, return, transfer_in), negative for deductions (sale, transfer_out), +/- for adjustments
    unit_cost BIGINT NOT NULL DEFAULT 0, -- In poisha
    reference_id UUID, -- purchase_id, sale_id, return_id, etc.
    reference_type VARCHAR(50), -- 'purchase', 'sale', 'return', 'adjustment', 'transfer'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1
);

-- -----------------------------------------------------------------------------
-- 9. Expenses & Operating Overhead
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL, -- 'rent', 'salary', 'utility', 'packaging', etc.
    amount BIGINT NOT NULL CHECK (amount > 0), -- Minor units (poisha)
    payment_method payment_method NOT NULL DEFAULT 'cash',
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1
);

-- -----------------------------------------------------------------------------
-- 10. Audit Log (Security & Traceability)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- e.g. 'sale.create', 'stock.adjust', 'price.update'
    entity_type VARCHAR(50) NOT NULL, -- 'sale', 'product_variant', etc.
    entity_id VARCHAR(100) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 11. Offline Sync: sync_changes & idempotency_keys
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    op sync_op NOT NULL,
    record_version BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    response_status INTEGER NOT NULL,
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_idempotency_key_per_tenant UNIQUE (tenant_id, key)
);

-- -----------------------------------------------------------------------------
-- 12. Helper Trigger Function: Auto-bump version & sync_changes tracking
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_touch_version_and_sync()
RETURNS TRIGGER AS $$
DECLARE
    v_op sync_op;
    v_tenant_id UUID;
    v_record_id UUID;
    v_version BIGINT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_op := 'INSERT';
        NEW.version := 1;
        NEW.created_at := now();
        NEW.updated_at := now();
        v_tenant_id := NEW.tenant_id;
        v_record_id := NEW.id;
        v_version := NEW.version;
    ELSIF TG_OP = 'UPDATE' THEN
        v_op := 'UPDATE';
        -- Increment version monotonically and refresh updated_at
        NEW.version := OLD.version + 1;
        NEW.updated_at := now();
        v_tenant_id := NEW.tenant_id;
        v_record_id := NEW.id;
        v_version := NEW.version;
    ELSIF TG_OP = 'DELETE' THEN
        v_op := 'DELETE';
        v_tenant_id := OLD.tenant_id;
        v_record_id := OLD.id;
        v_version := OLD.version + 1;
    END IF;

    -- Track delta in sync_changes for offline clients
    INSERT INTO sync_changes (tenant_id, table_name, record_id, op, record_version, updated_at)
    VALUES (v_tenant_id, TG_TABLE_NAME, v_record_id, v_op, v_version, now());

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach sync & version trigger to core tenant-owned entities
CREATE OR REPLACE TRIGGER trg_sync_products
    BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION fn_touch_version_and_sync();

CREATE OR REPLACE TRIGGER trg_sync_product_variants
    BEFORE INSERT OR UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION fn_touch_version_and_sync();

CREATE OR REPLACE TRIGGER trg_sync_customers
    BEFORE INSERT OR UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION fn_touch_version_and_sync();

CREATE OR REPLACE TRIGGER trg_sync_stock_movements
    BEFORE INSERT OR UPDATE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION fn_touch_version_and_sync();

CREATE OR REPLACE TRIGGER trg_sync_sales
    BEFORE INSERT OR UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION fn_touch_version_and_sync();

-- -----------------------------------------------------------------------------
-- 13. Sensible Performance Indexes
-- Composite indexes always put tenant_id first to ensure tenant partition filtering
-- -----------------------------------------------------------------------------
-- Tenants & Members
CREATE INDEX IF NOT EXISTS idx_tenant_members_lookup ON tenant_members(tenant_id, user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stores_tenant ON stores(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_locations_store ON stock_locations(tenant_id, store_id) WHERE deleted_at IS NULL;

-- Categories & Brands
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_brands_tenant ON brands(tenant_id) WHERE deleted_at IS NULL;

-- Products & Variants (with Trigram FTS and Barcode/SKU lookups)
CREATE INDEX IF NOT EXISTS idx_products_tenant_active ON products(tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(tenant_id, barcode) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(tenant_id, sku) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(tenant_id, product_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_serials_lookup ON product_serials(tenant_id, variant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_serials_number ON product_serials(tenant_id, serial_number) WHERE deleted_at IS NULL;

-- Customers & Suppliers
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(tenant_id, phone) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id) WHERE deleted_at IS NULL;

-- Sales & Items
CREATE INDEX IF NOT EXISTS idx_sales_tenant_date ON sales(tenant_id, sold_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(tenant_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(tenant_id, customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON sale_items(tenant_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(tenant_id, sale_id);

-- Purchases & Items
CREATE INDEX IF NOT EXISTS idx_purchases_tenant_date ON purchases(tenant_id, purchase_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(tenant_id, purchase_id);

-- Inventory Ledger
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_loc ON stock_movements(tenant_id, variant_id, location_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(tenant_id, reference_type, reference_id);

-- Expenses & Audit Logs
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(tenant_id, expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(tenant_id, entity_type, entity_id);

-- Offline Sync & Idempotency
CREATE INDEX IF NOT EXISTS idx_sync_changes_pull ON sync_changes(tenant_id, updated_at ASC);
CREATE INDEX IF NOT EXISTS idx_sync_changes_table_ver ON sync_changes(tenant_id, table_name, record_version);
CREATE INDEX IF NOT EXISTS idx_idempotency_lookup ON idempotency_keys(tenant_id, key);
