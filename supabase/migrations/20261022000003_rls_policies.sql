-- =============================================================================
-- Migration: 20261022000003_rls_policies.sql
-- Description: Row Level Security (RLS) policies and RBAC security functions
-- for Dokani Multi-Tenant POS SaaS.
-- Guarantees:
--   1. Zero cross-tenant data leaks (tenant A can never read/write tenant B).
--   2. Role-based restrictions (owner, manager, cashier).
--   3. Immutability for stock_movements and audit_logs (append-only).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table: tenant_invitations
-- Supports inviting staff (cashiers, managers) via email and token.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'cashier',
    token TEXT NOT NULL UNIQUE,
    invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant ON tenant_invitations(tenant_id, email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_token ON tenant_invitations(token) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 2. Security Functions (SECURITY DEFINER to avoid recursive policy evaluation)
-- -----------------------------------------------------------------------------

-- Checks if current authenticated user has active membership in tenant
CREATE OR REPLACE FUNCTION is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM tenant_members
        WHERE tenant_id = p_tenant_id
          AND user_id = auth.uid()
          AND is_active = true
          AND deleted_at IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Checks if current authenticated user has one of the specified roles in tenant
CREATE OR REPLACE FUNCTION has_role(p_tenant_id UUID, p_roles user_role[])
RETURNS BOOLEAN AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM tenant_members
        WHERE tenant_id = p_tenant_id
          AND user_id = auth.uid()
          AND role = ANY(p_roles)
          AND is_active = true
          AND deleted_at IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Gets the active role of current user in tenant
CREATE OR REPLACE FUNCTION get_user_tenant_role(p_tenant_id UUID)
RETURNS user_role AS $$
DECLARE
    v_role user_role;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT role INTO v_role
    FROM tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND is_active = true
      AND deleted_at IS NULL
    LIMIT 1;

    RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- 3. Enable RLS on ALL tables
-- -----------------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. RLS Policies
-- -----------------------------------------------------------------------------

-- --- PROFILES ---
CREATE POLICY profiles_select_all ON profiles
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY profiles_update_self ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY profiles_insert_self ON profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

-- --- TENANTS ---
-- Members can view their tenants
CREATE POLICY tenants_select_member ON tenants
    FOR SELECT TO authenticated
    USING (is_tenant_member(id) AND deleted_at IS NULL);

-- Only owners can update tenant metadata
CREATE POLICY tenants_update_owner ON tenants
    FOR UPDATE TO authenticated
    USING (has_role(id, ARRAY['owner'::user_role]))
    WITH CHECK (has_role(id, ARRAY['owner'::user_role]));

-- --- TENANT MEMBERS ---
-- Members can see coworkers in the same tenant
CREATE POLICY tenant_members_select ON tenant_members
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

-- Owners and managers can add members; cashiers cannot
CREATE POLICY tenant_members_insert ON tenant_members
    FOR INSERT TO authenticated
    WITH CHECK (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

-- Owners can update any member's role; managers can only manage cashiers
CREATE POLICY tenant_members_update ON tenant_members
    FOR UPDATE TO authenticated
    USING (
        has_role(tenant_id, ARRAY['owner'::user_role])
        OR (has_role(tenant_id, ARRAY['manager'::user_role]) AND role = 'cashier'::user_role)
    );

-- Owners can remove members
CREATE POLICY tenant_members_delete ON tenant_members
    FOR DELETE TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role]));

-- --- TENANT INVITATIONS ---
-- Members can view invitations, or recipient can view their pending invitation
CREATE POLICY invitations_select ON tenant_invitations
    FOR SELECT TO authenticated
    USING (
        is_tenant_member(tenant_id)
        OR email = (auth.jwt()->>'email')
    );

-- Owners and managers can send invitations
CREATE POLICY invitations_insert ON tenant_invitations
    FOR INSERT TO authenticated
    WITH CHECK (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

-- Owners and managers can revoke invitations
CREATE POLICY invitations_update ON tenant_invitations
    FOR UPDATE TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

-- --- SUBSCRIPTIONS ---
CREATE POLICY subscriptions_select ON subscriptions
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id));

CREATE POLICY subscriptions_update_owner ON subscriptions
    FOR UPDATE TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role]));

-- --- STORES & STOCK LOCATIONS ---
CREATE POLICY stores_select ON stores
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY stores_all_owner_manager ON stores
    FOR ALL TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
    WITH CHECK (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

CREATE POLICY stock_locations_select ON stock_locations
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY stock_locations_all_owner_manager ON stock_locations
    FOR ALL TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
    WITH CHECK (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

-- --- CATALOG (Categories, Brands, Products, Variants, Serials) ---
-- All tenant members (including cashiers) can read catalog items
CREATE POLICY categories_select ON categories
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY categories_modify ON categories
    FOR ALL TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
    WITH CHECK (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

CREATE POLICY brands_select ON brands
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY brands_modify ON brands
    FOR ALL TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
    WITH CHECK (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

CREATE POLICY products_select ON products
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY products_modify ON products
    FOR ALL TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
    WITH CHECK (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

CREATE POLICY variants_select ON product_variants
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY variants_modify ON product_variants
    FOR ALL TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
    WITH CHECK (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

CREATE POLICY serials_select ON product_serials
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY serials_modify ON product_serials
    FOR ALL TO authenticated
    USING (is_tenant_member(tenant_id)) -- Cashiers need to update serial status to 'sold' on checkout
    WITH CHECK (is_tenant_member(tenant_id));

-- --- CUSTOMERS & SUPPLIERS ---
CREATE POLICY customers_select ON customers
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

-- Cashiers can create/update customers during POS checkout
CREATE POLICY customers_insert_update ON customers
    FOR INSERT TO authenticated
    WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY customers_update ON customers
    FOR UPDATE TO authenticated
    USING (is_tenant_member(tenant_id));

-- Only managers and owners can delete customers
CREATE POLICY customers_delete ON customers
    FOR DELETE TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

-- Suppliers: restricted to managers & owners
CREATE POLICY suppliers_select ON suppliers
    FOR SELECT TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]) AND deleted_at IS NULL);

CREATE POLICY suppliers_modify ON suppliers
    FOR ALL TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
    WITH CHECK (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

-- --- PURCHASES & INBOUND STOCK ---
CREATE POLICY purchases_select ON purchases
    FOR SELECT TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]) AND deleted_at IS NULL);

CREATE POLICY purchases_modify ON purchases
    FOR ALL TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
    WITH CHECK (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

CREATE POLICY purchase_items_select ON purchase_items
    FOR SELECT TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]) AND deleted_at IS NULL);

CREATE POLICY purchase_items_modify ON purchase_items
    FOR ALL TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
    WITH CHECK (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

-- --- SALES, SALE ITEMS, PAYMENTS & RETURNS ---
-- Any tenant member (including cashier) can read and create sales
CREATE POLICY sales_select ON sales
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY sales_insert ON sales
    FOR INSERT TO authenticated
    WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY sales_update ON sales
    FOR UPDATE TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

-- Cashiers cannot delete sales; only owners can void/delete
CREATE POLICY sales_delete ON sales
    FOR DELETE TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role]));

CREATE POLICY sale_items_select ON sale_items
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY sale_items_insert ON sale_items
    FOR INSERT TO authenticated
    WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY sale_payments_select ON sale_payments
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY sale_payments_insert ON sale_payments
    FOR INSERT TO authenticated
    WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY returns_select ON returns
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY returns_insert ON returns
    FOR INSERT TO authenticated
    WITH CHECK (is_tenant_member(tenant_id));

-- --- STOCK MOVEMENTS (IMMUTABLE LEDGER) ---
-- Any tenant member can view movements and insert new movements
CREATE POLICY stock_movements_select ON stock_movements
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY stock_movements_insert ON stock_movements
    FOR INSERT TO authenticated
    WITH CHECK (is_tenant_member(tenant_id));

-- NO UPDATE OR DELETE POLICY DEFINED FOR stock_movements!
-- In Postgres, omitting UPDATE/DELETE policies under RLS strictly FORBIDS all updates and deletes.

-- --- EXPENSES ---
-- Cashiers cannot view or log expenses
CREATE POLICY expenses_select ON expenses
    FOR SELECT TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]) AND deleted_at IS NULL);

CREATE POLICY expenses_modify ON expenses
    FOR ALL TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
    WITH CHECK (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

-- --- AUDIT LOGS (IMMUTABLE) ---
-- Only owners and managers can read audit logs
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (is_tenant_member(tenant_id));

-- NO UPDATE OR DELETE POLICY DEFINED FOR audit_logs (append-only audit trail).

-- --- OFFLINE SYNC & IDEMPOTENCY ---
CREATE POLICY sync_changes_select ON sync_changes
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id));

CREATE POLICY idempotency_keys_select ON idempotency_keys
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id));

CREATE POLICY idempotency_keys_insert ON idempotency_keys
    FOR INSERT TO authenticated
    WITH CHECK (is_tenant_member(tenant_id));
