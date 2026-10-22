-- =============================================================================
-- Migration: 20261022000007_offline_sync.sql
-- Description: STEP 5: Offline Sync & Resilience Engine.
--   1. Adds offline_invoice_number to sales table with index.
--   2. Creates tenant_devices table for POS terminal tracking and revocation.
--   3. Updates fn_create_sale to support:
--      - p_is_offline_sync: accepts physical sales when offline even if server stock is 0,
--        records ledger movement, and writes a negative_stock_alert to audit_logs.
--      - p_client_sale_id: accepts client-generated UUID v7 to preserve immutable client IDs.
--      - p_offline_invoice_number: stores the local terminal invoice identifier.
--   4. Creates fn_revoke_device RPC for remote terminal authorization security.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Offline Invoice Column on Sales
-- -----------------------------------------------------------------------------
ALTER TABLE sales ADD COLUMN IF NOT EXISTS offline_invoice_number VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_sales_offline_invoice 
    ON sales(tenant_id, offline_invoice_number) 
    WHERE offline_invoice_number IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Tenant Devices (Terminal Registration & Remote Revocation)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    device_code VARCHAR(50) NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES profiles(id),
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_device_code_per_tenant UNIQUE (tenant_id, device_code)
);

ALTER TABLE tenant_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_devices_all ON tenant_devices
    FOR ALL TO authenticated
    USING (is_tenant_member(tenant_id))
    WITH CHECK (is_tenant_member(tenant_id));

-- Trigger to track sync deltas for tenant_devices
CREATE OR REPLACE TRIGGER trg_sync_tenant_devices
    BEFORE INSERT OR UPDATE ON tenant_devices
    FOR EACH ROW EXECUTE FUNCTION fn_touch_version_and_sync();

-- -----------------------------------------------------------------------------
-- 3. RPC: fn_revoke_device (Manager / Owner only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_revoke_device(
    p_tenant_id UUID,
    p_device_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_role user_role;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role INTO v_actor_role
    FROM tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = v_actor_id
      AND is_active = true
      AND deleted_at IS NULL;

    IF v_actor_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Forbidden: Only owners and managers can revoke terminal devices';
    END IF;

    UPDATE tenant_devices
    SET is_revoked = TRUE,
        revoked_at = now(),
        revoked_by = v_actor_id,
        updated_at = now()
    WHERE id = p_device_id AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Device not found';
    END IF;

    INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id, new_data)
    VALUES (p_tenant_id, v_actor_id, 'revoke:device', 'tenant_devices', p_device_id, jsonb_build_object('revoked_at', now()));

    RETURN jsonb_build_object('success', true, 'deviceId', p_device_id, 'isRevoked', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Updated fn_create_sale Supporting Offline Sync & Reconciliation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_create_sale(
    p_tenant_id UUID,
    p_store_id UUID,
    p_location_id UUID,
    p_customer_id UUID DEFAULT NULL,
    p_cashier_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_cart_discount_type VARCHAR DEFAULT 'none',
    p_cart_discount_value NUMERIC DEFAULT 0,
    p_payments JSONB DEFAULT '[]'::jsonb,
    p_notes TEXT DEFAULT NULL,
    p_is_offline_sync BOOLEAN DEFAULT FALSE,
    p_client_sale_id UUID DEFAULT NULL,
    p_offline_invoice_number VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_role user_role;
    v_store_code VARCHAR(20);
    v_seq BIGINT;
    v_invoice_number VARCHAR(100);
    v_sale_id UUID;
    v_item RECORD;
    v_variant RECORD;
    v_product RECORD;
    v_available_stock INTEGER;
    v_unit_price BIGINT;
    v_unit_cost BIGINT;
    v_line_qty INTEGER;
    v_line_raw_subtotal BIGINT;
    v_line_discount BIGINT := 0;
    v_line_tax BIGINT := 0;
    v_line_final_subtotal BIGINT;
    v_subtotal BIGINT := 0;
    v_total_item_discounts BIGINT := 0;
    v_total_tax BIGINT := 0;
    v_cart_discount BIGINT := 0;
    v_total_discount BIGINT := 0;
    v_total_amount BIGINT := 0;
    v_paid_amount BIGINT := 0;
    v_due_amount BIGINT := 0;
    v_change_amount BIGINT := 0;
    v_payment RECORD;
    v_payment_id UUID;
    v_item_subtotal_after_item_disc BIGINT;
    v_running_cart_disc_alloc BIGINT := 0;
    v_line_cart_discount BIGINT;
    v_prefix VARCHAR(30);
    v_serial_record RECORD;
    v_serial TEXT;
    v_serial_arr TEXT[];
    v_now_ym VARCHAR(6);
BEGIN
    -- 1. Authentication & Role validation
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role INTO v_actor_role
    FROM tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = v_actor_id
      AND is_active = true
      AND deleted_at IS NULL;

    IF v_actor_role IS NULL THEN
        RAISE EXCEPTION 'User does not belong to this tenant or is inactive';
    END IF;

    -- 2. Lookup Store Code
    SELECT code INTO v_store_code
    FROM stores
    WHERE id = p_store_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;

    IF v_store_code IS NULL THEN
        v_store_code := 'MAIN';
    END IF;

    -- 3. Generate Gapless Fiscal Invoice Number
    v_now_ym := to_char(now(), 'YYYYMM');
    v_prefix := 'INV-' || v_store_code || '-' || v_now_ym || '-';

    INSERT INTO branch_invoice_sequences (tenant_id, store_id, prefix, last_seq, updated_at)
    VALUES (p_tenant_id, p_store_id, v_prefix, 1, now())
    ON CONFLICT (tenant_id, store_id, prefix)
    DO UPDATE SET
        last_seq = branch_invoice_sequences.last_seq + 1,
        updated_at = now()
    RETURNING last_seq INTO v_seq;

    v_invoice_number := v_prefix || lpad(v_seq::TEXT, 6, '0');

    -- 4. Create primary sale record container (client UUID v7 if provided, or generated)
    IF p_client_sale_id IS NOT NULL THEN
        v_sale_id := p_client_sale_id;
    ELSE
        v_sale_id := gen_random_uuid();
    END IF;

    -- 5. Process items with FOR UPDATE locks and SERVER-SIDE price calculations
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        variant_id UUID,
        quantity INTEGER,
        discount_type VARCHAR,
        discount_value NUMERIC,
        serials JSONB
    )
    LOOP
        v_line_qty := v_item.quantity;
        IF v_line_qty IS NULL OR v_line_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid quantity for variant %', v_item.variant_id;
        END IF;

        -- Row-level lock on variant
        SELECT pv.* INTO v_variant
        FROM product_variants pv
        WHERE pv.id = v_item.variant_id AND pv.tenant_id = p_tenant_id AND pv.deleted_at IS NULL
        FOR UPDATE;

        IF v_variant.id IS NULL THEN
            RAISE EXCEPTION 'Product variant % not found or deleted', v_item.variant_id;
        END IF;

        SELECT p.* INTO v_product
        FROM products p
        WHERE p.id = v_variant.product_id AND p.tenant_id = p_tenant_id AND p.deleted_at IS NULL;

        -- Stock verification
        v_available_stock := fn_get_stock_quantity(p_tenant_id, v_variant.id, p_location_id);
        IF v_available_stock < v_line_qty THEN
            IF p_is_offline_sync THEN
                -- In offline sync mode: accept the sale because the customer already left the physical shop!
                -- Record negative_stock alert for management review.
                INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id, old_data, new_data)
                VALUES (
                    p_tenant_id,
                    v_actor_id,
                    'alert:negative_stock',
                    'sales',
                    v_sale_id,
                    jsonb_build_object('available_stock', v_available_stock, 'requested_quantity', v_line_qty, 'variant_id', v_variant.id),
                    jsonb_build_object('message', 'Offline sale accepted with insufficient stock', 'variant_name', v_variant.name, 'deficit', v_line_qty - v_available_stock)
                );
            ELSE
                -- Live online checkout: reject to prevent overselling
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Item "%" only has % available (requested %)',
                    v_variant.name, v_available_stock, v_line_qty;
            END IF;
        END IF;

        -- Server-side authoritative prices
        v_unit_price := v_variant.retail_price;
        v_unit_cost := COALESCE(v_variant.cost_price, 0);
        v_line_raw_subtotal := v_unit_price * v_line_qty;

        -- Calculate item discount with cashier limit enforcement
        v_line_discount := 0;
        IF v_item.discount_type = 'percent' AND v_item.discount_value > 0 THEN
            IF v_actor_role = 'cashier' AND v_item.discount_value > 10 THEN
                RAISE EXCEPTION 'Cashiers cannot apply item discounts greater than 10%%';
            END IF;
            v_line_discount := round((v_line_raw_subtotal * v_item.discount_value) / 100);
        ELSIF v_item.discount_type = 'fixed' AND v_item.discount_value > 0 THEN
            IF v_actor_role = 'cashier' AND (v_item.discount_value > (v_line_raw_subtotal * 0.10)) THEN
                RAISE EXCEPTION 'Cashiers cannot apply item discounts exceeding 10%% of subtotal';
            END IF;
            v_line_discount := round(v_item.discount_value);
        END IF;

        IF v_line_discount > v_line_raw_subtotal THEN
            v_line_discount := v_line_raw_subtotal;
        END IF;

        v_line_final_subtotal := v_line_raw_subtotal - v_line_discount;
        v_line_tax := round((v_line_final_subtotal * v_variant.tax_rate) / 10000);

        -- Serial numbers processing
        v_serial_arr := '{}';
        IF v_product.has_serials THEN
            IF v_item.serials IS NULL OR jsonb_array_length(v_item.serials) != v_line_qty THEN
                RAISE EXCEPTION 'Product "%" requires exactly % serial number(s)', v_product.name, v_line_qty;
            END IF;

            FOR v_serial IN SELECT jsonb_array_elements_text(v_item.serials)
            LOOP
                SELECT * INTO v_serial_record
                FROM product_serials
                WHERE tenant_id = p_tenant_id
                  AND variant_id = v_variant.id
                  AND serial_number = v_serial
                  AND deleted_at IS NULL
                FOR UPDATE;

                IF v_serial_record.id IS NULL THEN
                    RAISE EXCEPTION 'Serial "%" not found for product "%"', v_serial, v_product.name;
                END IF;

                IF v_serial_record.status != 'available' THEN
                    IF p_is_offline_sync THEN
                        -- Flag duplicate serial collision in audit logs
                        INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id, new_data)
                        VALUES (
                            p_tenant_id,
                            v_actor_id,
                            'alert:serial_collision',
                            'product_serials',
                            v_serial_record.id,
                            jsonb_build_object('serial_number', v_serial, 'current_status', v_serial_record.status, 'sale_id', v_sale_id)
                        );
                    ELSE
                        RAISE EXCEPTION 'Serial "%" is not available (status: %)', v_serial, v_serial_record.status;
                    END IF;
                END IF;

                UPDATE product_serials
                SET status = 'sold',
                    times_sold = times_sold + 1,
                    warranty_start = CURRENT_DATE,
                    warranty_end = CASE 
                        WHEN v_product.warranty_months > 0 
                        THEN CURRENT_DATE + (v_product.warranty_months || ' months')::INTERVAL 
                        ELSE NULL 
                    END,
                    updated_at = now()
                WHERE id = v_serial_record.id;

                v_serial_arr := array_append(v_serial_arr, v_serial);
            END LOOP;
        END IF;

        -- Write sale_item record
        INSERT INTO sale_items (
            tenant_id,
            sale_id,
            variant_id,
            quantity,
            unit_price,
            unit_cost,
            discount_amount,
            tax_amount,
            subtotal,
            serial_numbers,
            created_by
        ) VALUES (
            p_tenant_id,
            v_sale_id,
            v_variant.id,
            v_line_qty,
            v_unit_price,
            v_unit_cost,
            v_line_discount,
            v_line_tax,
            v_line_final_subtotal,
            v_serial_arr,
            v_actor_id
        );

        -- Write stock_movement ledger (sale_out)
        INSERT INTO stock_movements (
            tenant_id,
            variant_id,
            store_id,
            location_id,
            movement_type,
            quantity,
            unit_cost,
            reference_type,
            reference_id,
            notes,
            created_by
        ) VALUES (
            p_tenant_id,
            v_variant.id,
            p_store_id,
            p_location_id,
            'sale_out',
            -v_line_qty,
            v_unit_cost,
            'sale',
            v_sale_id,
            CASE WHEN p_is_offline_sync THEN 'Offline Sale ' || v_invoice_number ELSE 'Sale ' || v_invoice_number END,
            v_actor_id
        );

        v_subtotal := v_subtotal + v_line_raw_subtotal;
        v_total_item_discounts := v_total_item_discounts + v_line_discount;
        v_total_tax := v_total_tax + v_line_tax;
    END LOOP;

    -- 6. Whole Cart Discount Calculation
    v_item_subtotal_after_item_disc := v_subtotal - v_total_item_discounts;
    IF p_cart_discount_type = 'percent' AND p_cart_discount_value > 0 THEN
        IF v_actor_role = 'cashier' AND p_cart_discount_value > 10 THEN
            RAISE EXCEPTION 'Cashiers cannot apply cart discounts greater than 10%%';
        END IF;
        v_cart_discount := round((v_item_subtotal_after_item_disc * p_cart_discount_value) / 100);
    ELSIF p_cart_discount_type = 'fixed' AND p_cart_discount_value > 0 THEN
        IF v_actor_role = 'cashier' AND (p_cart_discount_value > (v_item_subtotal_after_item_disc * 0.10)) THEN
            RAISE EXCEPTION 'Cashiers cannot apply cart discounts exceeding 10%% of subtotal';
        END IF;
        v_cart_discount := round(p_cart_discount_value);
    END IF;

    IF v_cart_discount > v_item_subtotal_after_item_disc THEN
        v_cart_discount := v_item_subtotal_after_item_disc;
    END IF;

    v_total_discount := v_total_item_discounts + v_cart_discount;
    v_total_amount := v_subtotal - v_total_discount + v_total_tax;

    -- 7. Payment Processing
    FOR v_payment IN SELECT * FROM jsonb_to_recordset(p_payments) AS x(
        method payment_method,
        amount BIGINT,
        reference VARCHAR
    )
    LOOP
        IF v_payment.amount IS NULL OR v_payment.amount <= 0 THEN
            CONTINUE;
        END IF;

        IF v_payment.method = 'due' THEN
            v_due_amount := v_due_amount + v_payment.amount;
        ELSE
            v_paid_amount := v_paid_amount + v_payment.amount;
            INSERT INTO sale_payments (
                tenant_id,
                sale_id,
                method,
                amount,
                reference,
                created_by
            ) VALUES (
                p_tenant_id,
                v_sale_id,
                v_payment.method,
                v_payment.amount,
                v_payment.reference,
                v_actor_id
            );
        END IF;
    END LOOP;

    -- If customer paid more in cash than total amount, calculate change
    IF v_paid_amount > v_total_amount THEN
        v_change_amount := v_paid_amount - v_total_amount;
        v_paid_amount := v_total_amount;
    ELSE
        -- If total paid is less than total amount and no explicit due tender was passed, remaining is due
        IF (v_paid_amount + v_due_amount) < v_total_amount THEN
            v_due_amount := v_total_amount - v_paid_amount;
        END IF;
    END IF;

    -- Validate that due requires an attached customer
    IF v_due_amount > 0 AND p_customer_id IS NULL THEN
        RAISE EXCEPTION 'Cannot record due balance without attaching a registered customer';
    END IF;

    -- 8. Write Sales Record
    INSERT INTO sales (
        id,
        tenant_id,
        store_id,
        customer_id,
        cashier_id,
        invoice_number,
        offline_invoice_number,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        paid_amount,
        due_amount,
        change_amount,
        notes,
        created_by
    ) VALUES (
        v_sale_id,
        p_tenant_id,
        p_store_id,
        p_customer_id,
        COALESCE(p_cashier_id, v_actor_id),
        v_invoice_number,
        p_offline_invoice_number,
        v_subtotal,
        v_total_discount,
        v_total_tax,
        v_total_amount,
        v_paid_amount,
        v_due_amount,
        v_change_amount,
        p_notes,
        v_actor_id
    );

    -- 9. If due amount > 0, write customer_payment due entry
    IF v_due_amount > 0 AND p_customer_id IS NOT NULL THEN
        INSERT INTO customer_payments (
            tenant_id,
            customer_id,
            amount,
            payment_method,
            reference,
            notes,
            created_by
        ) VALUES (
            p_tenant_id,
            p_customer_id,
            v_due_amount,
            'cash',
            v_invoice_number,
            'Sale Due Receivable from ' || v_invoice_number,
            v_actor_id
        );
    END IF;

    -- 10. Audit Logging
    INSERT INTO audit_logs (
        tenant_id,
        user_id,
        action,
        entity,
        entity_id,
        new_data
    ) VALUES (
        p_tenant_id,
        v_actor_id,
        'create:sale',
        'sales',
        v_sale_id,
        jsonb_build_object(
            'invoice_number', v_invoice_number,
            'offline_invoice_number', p_offline_invoice_number,
            'total_amount', v_total_amount,
            'paid_amount', v_paid_amount,
            'due_amount', v_due_amount,
            'is_offline_sync', p_is_offline_sync
        )
    );

    -- 11. Return response JSON
    RETURN jsonb_build_object(
        'saleId', v_sale_id,
        'invoiceNumber', v_invoice_number,
        'offlineInvoiceNumber', p_offline_invoice_number,
        'subtotal', v_subtotal,
        'discountAmount', v_total_discount,
        'taxAmount', v_total_tax,
        'totalAmount', v_total_amount,
        'paidAmount', v_paid_amount,
        'dueAmount', v_due_amount,
        'changeAmount', v_change_amount
    );
END;
$$;
