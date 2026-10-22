-- =============================================================================
-- Migration 000009: SaaS Billing, Plan Limits, Payment Webhooks & Super Admin
-- =============================================================================

-- 1. Profiles Extension: Super-Admin Flag
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. Subscriptions Extension: Trial, Grace Period, Provider IDs
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '14 days'),
    ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(20) NOT NULL DEFAULT 'month',
    ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50),
    ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_customer_id TEXT;

-- Update existing subscriptions to have trial_ends_at if null
UPDATE subscriptions
SET trial_ends_at = created_at + INTERVAL '14 days'
WHERE trial_ends_at IS NULL;

-- 3. Subscription Invoices Table
CREATE TABLE IF NOT EXISTS subscription_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    amount_poisha BIGINT NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'BDT',
    plan_tier plan_tier NOT NULL,
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'month',
    status VARCHAR(30) NOT NULL DEFAULT 'paid', -- 'pending', 'paid', 'failed', 'refunded'
    payment_provider VARCHAR(50) NOT NULL,
    provider_transaction_id TEXT,
    provider_payload JSONB,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_tenant ON subscription_invoices(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_trx ON subscription_invoices(provider_transaction_id);

-- 4. Payment Webhooks Log (Idempotency & Audit)
CREATE TABLE IF NOT EXISTS payment_webhooks_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    event_type TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'processed', -- 'processed', 'ignored', 'failed', 'duplicate'
    payload JSONB NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_idemp ON payment_webhooks_log(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_webhooks_created ON payment_webhooks_log(created_at DESC);

-- 5. Enable RLS
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhooks_log ENABLE ROW LEVEL SECURITY;

-- Members can view their tenant's subscription invoices
CREATE POLICY sub_invoices_tenant_select ON subscription_invoices
    FOR SELECT TO authenticated
    USING (is_tenant_member(tenant_id));

-- Owners can insert/update invoices (or server role)
CREATE POLICY sub_invoices_owner_all ON subscription_invoices
    FOR ALL TO authenticated
    USING (has_role(tenant_id, ARRAY['owner'::user_role]));

-- Webhooks log is strictly internal / service-role only (no regular user select)
CREATE POLICY webhooks_log_admin ON payment_webhooks_log
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.is_super_admin = true
        )
    );

-- 6. Helper Function: Check Plan Limits Server-Side
CREATE OR REPLACE FUNCTION fn_check_plan_limits(
    p_tenant_id UUID,
    p_resource TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sub RECORD;
    v_current_count INTEGER := 0;
    v_max_allowed INTEGER := 0;
    v_is_read_only BOOLEAN := false;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_sub
    FROM subscriptions
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'No active subscription found for tenant'
        );
    END IF;

    -- Evaluate read-only status:
    -- If status is past_due AND grace_period_ends_at is past, lock writes!
    IF v_sub.status = 'past_due' AND v_sub.grace_period_ends_at IS NOT NULL AND v_now > v_sub.grace_period_ends_at THEN
        v_is_read_only := true;
    ELSIF v_sub.status = 'canceled' AND v_sub.current_period_end IS NOT NULL AND v_now > v_sub.current_period_end THEN
        v_is_read_only := true;
    END IF;

    IF v_is_read_only THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'isReadOnly', true,
            'reason', 'Subscription is past due and grace period has expired. Account is in read-only mode.'
        );
    END IF;

    IF p_resource = 'stores' THEN
        SELECT COUNT(*) INTO v_current_count
        FROM stores
        WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;
        v_max_allowed := v_sub.max_stores;
    ELSIF p_resource = 'staff' THEN
        SELECT COUNT(*) INTO v_current_count
        FROM tenant_members
        WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active = true;
        v_max_allowed := v_sub.max_staff;
    ELSIF p_resource = 'products' THEN
        SELECT COUNT(*) INTO v_current_count
        FROM products
        WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;
        v_max_allowed := v_sub.max_products;
    ELSE
        RETURN jsonb_build_object('allowed', true);
    END IF;

    IF v_current_count >= v_max_allowed THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'resource', p_resource,
            'current', v_current_count,
            'max', v_max_allowed,
            'reason', format('Plan limit reached: %s of %s %s used. Upgrade plan to create more.', v_current_count, v_max_allowed, p_resource)
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', true,
        'resource', p_resource,
        'current', v_current_count,
        'max', v_max_allowed
    );
END;
$$;

-- 7. Atomic Subscription Payment Handler RPC
CREATE OR REPLACE FUNCTION fn_record_subscription_payment(
    p_tenant_id UUID,
    p_plan plan_tier,
    p_interval TEXT,
    p_amount_poisha BIGINT,
    p_provider TEXT,
    p_transaction_id TEXT,
    p_payload JSONB,
    p_max_stores INTEGER,
    p_max_products INTEGER,
    p_max_staff INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invoice_number TEXT;
    v_seq_num BIGINT;
    v_period_start TIMESTAMPTZ := now();
    v_period_end TIMESTAMPTZ;
    v_invoice_id UUID := gen_random_uuid();
BEGIN
    -- Check for duplicate transaction id (Idempotency guarantee)
    IF EXISTS (
        SELECT 1 FROM subscription_invoices
        WHERE provider_transaction_id = p_transaction_id
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'message', 'Transaction already recorded'
        );
    END IF;

    -- Calculate period end
    IF p_interval = 'year' THEN
        v_period_end := v_period_start + INTERVAL '1 year';
    ELSE
        v_period_end := v_period_start + INTERVAL '1 month';
    END IF;

    -- Generate sequential invoice number: SUB-YYYYMM-XXXX
    SELECT COUNT(*) + 1 INTO v_seq_num FROM subscription_invoices;
    v_invoice_number := format('SUB-%s-%s', to_char(v_period_start, 'YYYYMM'), lpad(v_seq_num::text, 4, '0'));

    -- 1. Insert subscription invoice
    INSERT INTO subscription_invoices (
        id,
        tenant_id,
        invoice_number,
        amount_poisha,
        currency,
        plan_tier,
        billing_interval,
        status,
        payment_provider,
        provider_transaction_id,
        provider_payload,
        period_start,
        period_end,
        paid_at
    ) VALUES (
        v_invoice_id,
        p_tenant_id,
        v_invoice_number,
        p_amount_poisha,
        'BDT',
        p_plan,
        p_interval,
        'paid',
        p_provider,
        p_transaction_id,
        p_payload,
        v_period_start,
        v_period_end,
        now()
    );

    -- 2. Update subscription active record
    UPDATE subscriptions
    SET plan_tier = p_plan,
        status = 'active',
        billing_interval = p_interval,
        payment_provider = p_provider,
        provider_subscription_id = p_transaction_id,
        current_period_start = v_period_start,
        current_period_end = v_period_end,
        grace_period_ends_at = NULL,
        cancel_at_period_end = false,
        max_stores = p_max_stores,
        max_products = p_max_products,
        max_staff = p_max_staff,
        updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL;

    -- 3. Log to audit_logs
    INSERT INTO audit_logs (
        tenant_id,
        action,
        entity,
        entity_id,
        new_data
    ) VALUES (
        p_tenant_id,
        'subscription:upgraded',
        'subscriptions',
        p_tenant_id,
        jsonb_build_object(
            'plan', p_plan,
            'interval', p_interval,
            'invoice_number', v_invoice_number,
            'amount_poisha', p_amount_poisha,
            'provider', p_provider,
            'transaction_id', p_transaction_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'plan_tier', p_plan,
        'period_end', v_period_end
    );
END;
$$;

-- 8. Super-Admin RPCs: Extend Trial & Override Plan
CREATE OR REPLACE FUNCTION fn_admin_extend_trial(
    p_tenant_id UUID,
    p_days INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_is_admin BOOLEAN := false;
    v_new_trial_end TIMESTAMPTZ;
BEGIN
    -- Verify super admin caller
    SELECT is_super_admin INTO v_caller_is_admin
    FROM profiles
    WHERE id = auth.uid();

    IF NOT COALESCE(v_caller_is_admin, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privileges required');
    END IF;

    SELECT COALESCE(trial_ends_at, now()) + (p_days || ' days')::INTERVAL
    INTO v_new_trial_end
    FROM subscriptions
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

    UPDATE subscriptions
    SET trial_ends_at = v_new_trial_end,
        current_period_end = v_new_trial_end,
        status = 'trialing',
        grace_period_ends_at = NULL,
        updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL;

    INSERT INTO audit_logs (
        tenant_id,
        user_id,
        action,
        entity,
        entity_id,
        new_data
    ) VALUES (
        p_tenant_id,
        auth.uid(),
        'admin:extend_trial',
        'subscriptions',
        p_tenant_id,
        jsonb_build_object('days_added', p_days, 'new_trial_ends_at', v_new_trial_end)
    );

    RETURN jsonb_build_object('success', true, 'new_trial_ends_at', v_new_trial_end);
END;
$$;

CREATE OR REPLACE FUNCTION fn_admin_set_plan(
    p_tenant_id UUID,
    p_plan plan_tier,
    p_status TEXT,
    p_max_stores INTEGER,
    p_max_products INTEGER,
    p_max_staff INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_is_admin BOOLEAN := false;
BEGIN
    SELECT is_super_admin INTO v_caller_is_admin
    FROM profiles
    WHERE id = auth.uid();

    IF NOT COALESCE(v_caller_is_admin, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privileges required');
    END IF;

    UPDATE subscriptions
    SET plan_tier = p_plan,
        status = p_status,
        max_stores = p_max_stores,
        max_products = p_max_products,
        max_staff = p_max_staff,
        updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL;

    INSERT INTO audit_logs (
        tenant_id,
        user_id,
        action,
        entity,
        entity_id,
        new_data
    ) VALUES (
        p_tenant_id,
        auth.uid(),
        'admin:set_plan',
        'subscriptions',
        p_tenant_id,
        jsonb_build_object(
            'plan', p_plan,
            'status', p_status,
            'max_stores', p_max_stores,
            'max_products', p_max_products,
            'max_staff', p_max_staff
        )
    );

    RETURN jsonb_build_object('success', true, 'plan', p_plan, 'status', p_status);
END;
$$;
