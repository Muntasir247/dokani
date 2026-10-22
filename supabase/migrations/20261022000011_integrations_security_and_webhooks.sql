-- =============================================================================
-- Migration 11: Integrations, Security Hardening, Public API, and Webhooks
-- Step 9 of Dokani POS SaaS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Courier Integrations & Shipments Ledger
-- -----------------------------------------------------------------------------

-- Tenant Courier Credentials (Encrypted credentials at rest per tenant)
CREATE TABLE IF NOT EXISTS tenant_courier_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('steadfast', 'pathao', 'custom')),
    api_key_encrypted TEXT NOT NULL,
    secret_key_encrypted TEXT,
    webhook_secret_encrypted TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_courier_configs_tenant ON tenant_courier_configs(tenant_id, provider);

-- Shipments Table with Duplicate-Dispatch Guard
CREATE TABLE IF NOT EXISTS shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    courier_provider VARCHAR(50) NOT NULL,
    consignment_id VARCHAR(100) NOT NULL,
    tracking_code VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'in_review' CHECK (
        status IN ('in_review', 'pending', 'picked', 'in_transit', 'delivered', 'partial_delivered', 'cancelled', 'return', 'hold')
    ),
    recipient_name TEXT NOT NULL,
    recipient_phone VARCHAR(30) NOT NULL,
    recipient_address TEXT NOT NULL,
    cod_amount_poisha BIGINT NOT NULL DEFAULT 0 CHECK (cod_amount_poisha >= 0),
    delivery_fee_poisha BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_poisha >= 0),
    timeline JSONB NOT NULL DEFAULT '[]'::JSONB,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Acceptance Criterion: Duplicate-dispatch guard
-- Enforces that a sale cannot have multiple active courier parcels
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_sale_shipment 
ON shipments(tenant_id, sale_id) 
WHERE status NOT IN ('cancelled', 'return');

CREATE INDEX IF NOT EXISTS idx_shipments_tenant_tracking ON shipments(tenant_id, tracking_code);
CREATE INDEX IF NOT EXISTS idx_shipments_consignment ON shipments(courier_provider, consignment_id);

-- -----------------------------------------------------------------------------
-- 2. Tenant Public API Keys (Business Plan Feature)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL, -- e.g. "dk_live_a1b2c3"
    key_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash of plaintext token
    scopes TEXT[] NOT NULL DEFAULT ARRAY['read:products', 'write:sales'],
    rate_limit_per_minute INT NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute > 0),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ, -- Immediate revocation if set
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON tenant_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_active ON tenant_api_keys(tenant_id, revoked_at);

-- -----------------------------------------------------------------------------
-- 3. Outgoing Webhook Endpoints & Deliveries
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret TEXT NOT NULL, -- HMAC-SHA256 signing secret
    events TEXT[] NOT NULL DEFAULT ARRAY['sale.created', 'stock.low'],
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON tenant_webhook_endpoints(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES tenant_webhook_endpoints(id) ON DELETE CASCADE,
    event VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
    status_code INT,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending ON webhook_deliveries(status, next_retry_at);

-- -----------------------------------------------------------------------------
-- 4. Data Protection: Retention Window Columns on Tenants
-- -----------------------------------------------------------------------------
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS retention_purge_after TIMESTAMPTZ;

-- RPC to schedule tenant deletion with retention grace period (default 30 days)
CREATE OR REPLACE FUNCTION fn_schedule_tenant_deletion(
    p_tenant_id UUID,
    p_retention_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_purge_date TIMESTAMPTZ;
BEGIN
    v_purge_date := now() + (p_retention_days || ' days')::INTERVAL;

    UPDATE tenants
    SET deleted_at = now(),
        deletion_scheduled_at = now(),
        retention_purge_after = v_purge_date,
        updated_at = now()
    WHERE id = p_tenant_id;

    -- Cancel active subscription
    UPDATE subscriptions
    SET status = 'canceled',
        updated_at = now()
    WHERE tenant_id = p_tenant_id;

    INSERT INTO audit_logs (
        tenant_id,
        action,
        entity_type,
        entity_id,
        new_values
    )
    VALUES (
        p_tenant_id,
        'tenant.deletion_scheduled',
        'tenants',
        p_tenant_id::TEXT,
        jsonb_build_object(
            'scheduled_at', now(),
            'retention_purge_after', v_purge_date,
            'retention_days', p_retention_days
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'tenantId', p_tenant_id,
        'deletionScheduledAt', now(),
        'retentionPurgeAfter', v_purge_date,
        'message', 'Store scheduled for deletion with ' || p_retention_days || '-day data retention window'
    );
END;
$$;

-- RPC to cancel tenant deletion within retention window
CREATE OR REPLACE FUNCTION fn_cancel_tenant_deletion(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE tenants
    SET deleted_at = NULL,
        deletion_scheduled_at = NULL,
        retention_purge_after = NULL,
        updated_at = now()
    WHERE id = p_tenant_id;

    INSERT INTO audit_logs (
        tenant_id,
        action,
        entity_type,
        entity_id,
        new_values
    )
    VALUES (
        p_tenant_id,
        'tenant.deletion_canceled',
        'tenants',
        p_tenant_id::TEXT,
        jsonb_build_object('canceled_at', now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'tenantId', p_tenant_id,
        'message', 'Store restored successfully'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Row Level Security Policies
-- -----------------------------------------------------------------------------
ALTER TABLE tenant_courier_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_courier_configs_tenant ON tenant_courier_configs
FOR ALL
USING (is_tenant_member(tenant_id) AND has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
WITH CHECK (is_tenant_member(tenant_id) AND has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

CREATE POLICY shipments_tenant ON shipments
FOR ALL
USING (is_tenant_member(tenant_id))
WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY tenant_api_keys_tenant ON tenant_api_keys
FOR ALL
USING (is_tenant_member(tenant_id) AND has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
WITH CHECK (is_tenant_member(tenant_id) AND has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

CREATE POLICY tenant_webhook_endpoints_tenant ON tenant_webhook_endpoints
FOR ALL
USING (is_tenant_member(tenant_id) AND has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
WITH CHECK (is_tenant_member(tenant_id) AND has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

CREATE POLICY webhook_deliveries_tenant ON webhook_deliveries
FOR ALL
USING (is_tenant_member(tenant_id) AND has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]))
WITH CHECK (is_tenant_member(tenant_id) AND has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));
