-- =============================================================================
-- Migration: 20261022000004_onboarding_and_invitations.sql
-- Description: Transactional RPC functions for tenant onboarding, staff
-- invitations, role modifications, and acceptance workflows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Onboarding Transaction: fn_create_tenant_onboarding
-- Atomically provisions a new tenant, main store outlet, default stock location,
-- owner membership, and Free tier subscription in a single Postgres transaction.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_create_tenant_onboarding(
    p_tenant_name TEXT,
    p_slug TEXT,
    p_store_name TEXT,
    p_store_code TEXT,
    p_currency VARCHAR DEFAULT 'BDT',
    p_timezone VARCHAR DEFAULT 'Asia/Dhaka'
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_tenant_id UUID;
    v_store_id UUID;
    v_location_id UUID;
    v_member_id UUID;
    v_subscription_id UUID;
    v_cleaned_slug TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required for tenant onboarding' USING ERRCODE = '42501';
    END IF;

    -- Normalize slug (lowercase, trim, replace spaces with hyphens)
    v_cleaned_slug := lower(trim(regexp_replace(p_slug, '[^a-zA-Z0-9]+', '-', 'g'), '-'));
    IF length(v_cleaned_slug) < 3 THEN
        RAISE EXCEPTION 'Tenant slug must be at least 3 alphanumeric characters' USING ERRCODE = '22023';
    END IF;

    -- Check slug uniqueness
    IF EXISTS (SELECT 1 FROM tenants WHERE slug = v_cleaned_slug AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Store URL slug "%" is already taken. Please choose another.', v_cleaned_slug USING ERRCODE = '23505';
    END IF;

    -- Ensure profile exists for the caller
    INSERT INTO profiles (id, email, full_name)
    VALUES (
        v_user_id,
        COALESCE(auth.jwt()->>'email', 'user@dokani.local'),
        COALESCE(auth.jwt()->>'name', split_part(COALESCE(auth.jwt()->>'email', 'Shop Owner'), '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;

    -- 1. Create Tenant
    INSERT INTO tenants (name, slug, currency, timezone)
    VALUES (trim(p_tenant_name), v_cleaned_slug, p_currency, p_timezone)
    RETURNING id INTO v_tenant_id;

    -- 2. Create Initial Store Branch (marked as main branch)
    INSERT INTO stores (tenant_id, name, code, is_main, created_by)
    VALUES (v_tenant_id, trim(p_store_name), upper(trim(p_store_code)), true, v_user_id)
    RETURNING id INTO v_store_id;

    -- 3. Create Default Stock Location
    INSERT INTO stock_locations (tenant_id, store_id, name, is_default, created_by)
    VALUES (v_tenant_id, v_store_id, 'Main Display Floor', true, v_user_id)
    RETURNING id INTO v_location_id;

    -- 4. Assign Owner Membership
    INSERT INTO tenant_members (tenant_id, user_id, role, is_active, created_by)
    VALUES (v_tenant_id, v_user_id, 'owner', true, v_user_id)
    RETURNING id INTO v_member_id;

    -- 5. Create Free Tier Subscription
    INSERT INTO subscriptions (tenant_id, plan_tier, status, max_stores, max_products, max_staff, created_by)
    VALUES (v_tenant_id, 'free', 'active', 1, 200, 2, v_user_id)
    RETURNING id INTO v_subscription_id;

    -- 6. Log Audit Event
    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, new_values)
    VALUES (
        v_tenant_id,
        v_user_id,
        'tenant.onboarding_completed',
        'tenant',
        v_tenant_id::TEXT,
        jsonb_build_object(
            'tenant_name', p_tenant_name,
            'slug', v_cleaned_slug,
            'store_id', v_store_id,
            'store_name', p_store_name
        )
    );

    RETURN jsonb_build_object(
        'tenant_id', v_tenant_id,
        'name', p_tenant_name,
        'slug', v_cleaned_slug,
        'store_id', v_store_id,
        'store_name', p_store_name,
        'location_id', v_location_id,
        'role', 'owner'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 2. Staff Invitation: fn_invite_staff
-- Generates an invitation token for a new cashier or manager.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_invite_staff(
    p_tenant_id UUID,
    p_email TEXT,
    p_role user_role
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_caller_role user_role;
    v_token TEXT;
    v_invitation_id UUID;
    v_cleaned_email TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- Verify caller authority
    SELECT role INTO v_caller_role
    FROM tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = v_user_id
      AND is_active = true
      AND deleted_at IS NULL;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'You do not belong to this store' USING ERRCODE = '42501';
    END IF;

    -- Role hierarchy: Managers cannot invite owners or other managers
    IF v_caller_role = 'manager' AND p_role != 'cashier' THEN
        RAISE EXCEPTION 'Managers can only invite Cashiers' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'cashier' THEN
        RAISE EXCEPTION 'Cashiers cannot invite staff' USING ERRCODE = '42501';
    END IF;

    v_cleaned_email := lower(trim(p_email));

    -- Check if user is already a member
    IF EXISTS (
        SELECT 1
        FROM tenant_members tm
        JOIN profiles p ON p.id = tm.user_id
        WHERE tm.tenant_id = p_tenant_id
          AND p.email = v_cleaned_email
          AND tm.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'User % is already a member of this store', v_cleaned_email USING ERRCODE = '23505';
    END IF;

    -- Generate cryptographically random token
    v_token := encode(gen_random_bytes(24), 'hex');

    -- Insert or refresh pending invitation
    INSERT INTO tenant_invitations (
        tenant_id,
        email,
        role,
        token,
        invited_by,
        expires_at
    )
    VALUES (
        p_tenant_id,
        v_cleaned_email,
        p_role,
        v_token,
        v_user_id,
        now() + INTERVAL '7 days'
    )
    RETURNING id INTO v_invitation_id;

    -- Audit Log
    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, new_values)
    VALUES (
        p_tenant_id,
        v_user_id,
        'member.invitation_created',
        'tenant_invitations',
        v_invitation_id::TEXT,
        jsonb_build_object('email', v_cleaned_email, 'role', p_role)
    );

    RETURN jsonb_build_object(
        'invitation_id', v_invitation_id,
        'email', v_cleaned_email,
        'role', p_role,
        'token', v_token,
        'expires_at', (now() + INTERVAL '7 days')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 3. Accept Invitation: fn_accept_invitation
-- Connects the authenticated user to the tenant using an invitation token.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_accept_invitation(
    p_token TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_invitation RECORD;
    v_member_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to accept an invitation' USING ERRCODE = '42501';
    END IF;

    v_user_email := lower(trim(auth.jwt()->>'email'));

    -- Find unexpired, unaccepted invitation
    SELECT * INTO v_invitation
    FROM tenant_invitations
    WHERE token = p_token
      AND accepted_at IS NULL
      AND deleted_at IS NULL
      AND expires_at > now()
    LIMIT 1;

    IF v_invitation.id IS NULL THEN
        RAISE EXCEPTION 'Invitation token is invalid, expired, or already used' USING ERRCODE = 'P0002';
    END IF;

    -- Ensure profile exists
    INSERT INTO profiles (id, email, full_name)
    VALUES (
        v_user_id,
        COALESCE(v_user_email, v_invitation.email),
        COALESCE(auth.jwt()->>'name', split_part(v_invitation.email, '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;

    -- Join Tenant
    INSERT INTO tenant_members (
        tenant_id,
        user_id,
        role,
        is_active,
        created_by
    )
    VALUES (
        v_invitation.tenant_id,
        v_user_id,
        v_invitation.role,
        true,
        v_invitation.invited_by
    )
    ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        is_active = true,
        deleted_at = NULL
    RETURNING id INTO v_member_id;

    -- Mark Invitation Accepted
    UPDATE tenant_invitations
    SET accepted_at = now()
    WHERE id = v_invitation.id;

    -- Audit Log
    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, new_values)
    VALUES (
        v_invitation.tenant_id,
        v_user_id,
        'member.invitation_accepted',
        'tenant_members',
        v_member_id::TEXT,
        jsonb_build_object('role', v_invitation.role, 'email', v_invitation.email)
    );

    RETURN jsonb_build_object(
        'tenant_id', v_invitation.tenant_id,
        'member_id', v_member_id,
        'role', v_invitation.role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4. Role Update: fn_update_member_role
-- Allows store owners to promote/demote staff.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_update_member_role(
    p_tenant_id UUID,
    p_member_id UUID,
    p_new_role user_role
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_caller_role user_role;
    v_target_old_role user_role;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- Verify caller is owner
    SELECT role INTO v_caller_role
    FROM tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = v_user_id
      AND is_active = true
      AND deleted_at IS NULL;

    IF v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'Only store owners can modify staff roles' USING ERRCODE = '42501';
    END IF;

    -- Retrieve old role
    SELECT role INTO v_target_old_role
    FROM tenant_members
    WHERE id = p_member_id
      AND tenant_id = p_tenant_id
      AND deleted_at IS NULL;

    IF v_target_old_role IS NULL THEN
        RAISE EXCEPTION 'Staff member not found' USING ERRCODE = 'P0002';
    END IF;

    -- Update role
    UPDATE tenant_members
    SET role = p_new_role,
        updated_at = now()
    WHERE id = p_member_id;

    -- Audit Log
    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (
        p_tenant_id,
        v_user_id,
        'member.role_changed',
        'tenant_members',
        p_member_id::TEXT,
        jsonb_build_object('role', v_target_old_role),
        jsonb_build_object('role', p_new_role)
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 5. Revoke Invitation: fn_revoke_invitation
-- Soft-deletes a pending invitation.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_revoke_invitation(
    p_invitation_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_invitation RECORD;
    v_caller_role user_role;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_invitation
    FROM tenant_invitations
    WHERE id = p_invitation_id AND deleted_at IS NULL;

    IF v_invitation.id IS NULL THEN
        RETURN false;
    END IF;

    -- Verify caller authority
    SELECT role INTO v_caller_role
    FROM tenant_members
    WHERE tenant_id = v_invitation.tenant_id
      AND user_id = v_user_id
      AND is_active = true
      AND deleted_at IS NULL;

    IF v_caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Insufficient permissions to revoke invitation' USING ERRCODE = '42501';
    END IF;

    UPDATE tenant_invitations
    SET deleted_at = now()
    WHERE id = p_invitation_id;

    -- Audit Log
    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, new_values)
    VALUES (
        v_invitation.tenant_id,
        v_user_id,
        'member.invitation_revoked',
        'tenant_invitations',
        p_invitation_id::TEXT,
        jsonb_build_object('email', v_invitation.email)
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
