-- =============================================================================
-- Migration: 20261022000006_pos_and_sales.sql
-- Description: POS sales engine, gapless branch invoice sequences, server-side
--              price and stock validation, returns, sale voiding, and customer dues.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Gapless Sequential Invoice Generator Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_invoice_sequences (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    prefix VARCHAR(20) NOT NULL DEFAULT 'INV',
    last_seq BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, store_id)
);

ALTER TABLE branch_invoice_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_sequences_all ON branch_invoice_sequences
    FOR ALL TO authenticated
    USING (is_tenant_member(tenant_id))
    WITH CHECK (is_tenant_member(tenant_id));

-- -----------------------------------------------------------------------------
-- 2. Enhance Sales Table (Status, Voiding, Discounts)
-- -----------------------------------------------------------------------------
ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completed'
        CHECK (status IN ('completed', 'voided', 'partially_returned', 'returned')),
    ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS void_reason TEXT,
    ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'fixed'
        CHECK (discount_type IN ('none', 'percent', 'fixed')),
    ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5, 2) DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 3. Enhance Returns & Add Return Items
-- -----------------------------------------------------------------------------
ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS refund_method payment_method NOT NULL DEFAULT 'cash';

CREATE TABLE IF NOT EXISTS return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    sale_item_id UUID REFERENCES sale_items(id) ON DELETE SET NULL,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    refund_unit_price BIGINT NOT NULL CHECK (refund_unit_price >= 0),
    subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
    restock BOOLEAN NOT NULL DEFAULT true,
    serial_numbers TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id)
);

ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY return_items_all ON return_items
    FOR ALL TO authenticated
    USING (is_tenant_member(tenant_id))
    WITH CHECK (is_tenant_member(tenant_id));

-- -----------------------------------------------------------------------------
-- 4. Customer Due Collections & Customer Balances View
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount > 0), -- In poisha
    payment_method payment_method NOT NULL DEFAULT 'cash',
    reference VARCHAR(100),
    notes TEXT,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id)
);

ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_payments_all ON customer_payments
    FOR ALL TO authenticated
    USING (is_tenant_member(tenant_id))
    WITH CHECK (is_tenant_member(tenant_id));

CREATE OR REPLACE VIEW view_customer_balances AS
SELECT
    c.id AS customer_id,
    c.tenant_id,
    c.name,
    c.phone,
    c.email,
    c.address,
    c.credit_limit,
    c.opening_balance,
    COALESCE(s.total_sales_due, 0) AS total_sales_due,
    COALESCE(p.total_payments, 0) AS total_payments,
    (c.opening_balance + COALESCE(s.total_sales_due, 0) - COALESCE(p.total_payments, 0)) AS current_due
FROM customers c
LEFT JOIN (
    SELECT customer_id, SUM(due_amount) AS total_sales_due
    FROM sales
    WHERE deleted_at IS NULL AND status != 'voided'
    GROUP BY customer_id
) s ON s.customer_id = c.id
LEFT JOIN (
    SELECT customer_id, SUM(amount) AS total_payments
    FROM customer_payments
    GROUP BY customer_id
) p ON p.customer_id = c.id
WHERE c.deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 5. RPC: fn_create_sale
-- Server-side stock validation, server-side price recomputation, gapless sequential
-- invoice numbers under concurrency, serial lock, and append-only stock movement.
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
    p_notes TEXT DEFAULT NULL
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
    v_serial TEXT;
    v_serial_record RECORD;
    v_serial_arr TEXT[];
    v_customer_due BIGINT := 0;
    v_customer_credit_limit BIGINT := 0;
BEGIN
    v_actor_id := auth.uid();

    -- 1. Verify tenant membership
    IF NOT is_tenant_member(p_tenant_id) THEN
        RAISE EXCEPTION 'Forbidden: Not a member of this tenant';
    END IF;

    v_actor_role := get_user_tenant_role(p_tenant_id);

    -- 2. Resolve store code
    SELECT code INTO v_store_code
    FROM stores
    WHERE id = p_store_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;

    IF v_store_code IS NULL THEN
        RAISE EXCEPTION 'Store not found or deleted';
    END IF;

    -- 3. Atomically acquire gapless sequential invoice number per branch
    INSERT INTO branch_invoice_sequences (tenant_id, store_id, last_seq, updated_at)
    VALUES (p_tenant_id, p_store_id, 1, now())
    ON CONFLICT (tenant_id, store_id)
    DO UPDATE SET
        last_seq = branch_invoice_sequences.last_seq + 1,
        updated_at = now()
    RETURNING last_seq INTO v_seq;

    v_invoice_number := 'INV-' || v_store_code || '-' || lpad(v_seq::text, 6, '0');

    -- 4. Create primary sale record container
    v_sale_id := gen_random_uuid();

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

        -- Row-level lock on variant to prevent race conditions & overselling
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

        -- Server-side stock verification
        v_available_stock := fn_get_stock_quantity(p_tenant_id, v_variant.id, p_location_id);
        IF v_available_stock < v_line_qty THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Item "%" only has % available (requested %)',
                v_variant.name, v_available_stock, v_line_qty;
        END IF;

        -- Server-side authoritative prices (NEVER TRUST CLIENT TOTALS)
        v_unit_price := v_variant.retail_price;
        v_unit_cost := v_variant.cost_price;
        v_line_raw_subtotal := v_unit_price * v_line_qty;

        -- Calculate item discount with cashier limit enforcement (max 10% for cashiers)
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

        -- Cap discount at line raw subtotal
        IF v_line_discount > v_line_raw_subtotal THEN
            v_line_discount := v_line_raw_subtotal;
        END IF;

        -- Tax calculation
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
                -- Lock serial row
                SELECT * INTO v_serial_record
                FROM product_serials
                WHERE tenant_id = p_tenant_id
                  AND variant_id = v_variant.id
                  AND serial_number = v_serial
                  AND deleted_at IS NULL
                FOR UPDATE;

                IF v_serial_record.id IS NULL THEN
                    RAISE EXCEPTION 'Serial number "%" does not exist for item "%"', v_serial, v_variant.name;
                END IF;

                IF v_serial_record.status != 'available' THEN
                    RAISE EXCEPTION 'Serial number "%" is not available (status: %)', v_serial, v_serial_record.status;
                END IF;

                -- Mark serial as sold (trigger trg_check_serial_sale_rules ensures times_sold <= 1)
                UPDATE product_serials
                SET status = 'sold',
                    sale_id = v_sale_id,
                    sold_at = now(),
                    times_sold = times_sold + 1,
                    updated_at = now()
                WHERE id = v_serial_record.id;

                v_serial_arr := array_append(v_serial_arr, v_serial);
            END LOOP;
        END IF;

        -- Insert sale_item
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

        -- Deduct inventory via append-only ledger
        INSERT INTO stock_movements (
            tenant_id,
            location_id,
            variant_id,
            type,
            quantity,
            unit_cost,
            reference_id,
            reference_type,
            notes,
            created_by
        ) VALUES (
            p_tenant_id,
            p_location_id,
            v_variant.id,
            'sale',
            -v_line_qty,
            v_unit_cost,
            v_sale_id,
            'sale',
            'Sale ' || v_invoice_number,
            v_actor_id
        );

        v_subtotal := v_subtotal + v_line_raw_subtotal;
        v_total_item_discounts := v_total_item_discounts + v_line_discount;
        v_total_tax := v_total_tax + v_line_tax;
    END LOOP;

    -- 6. Apply Cart-Level Discount
    v_cart_discount := 0;
    IF p_cart_discount_type = 'percent' AND p_cart_discount_value > 0 THEN
        IF v_actor_role = 'cashier' AND p_cart_discount_value > 10 THEN
            RAISE EXCEPTION 'Cashiers cannot apply cart discounts greater than 10%%';
        END IF;
        v_cart_discount := round(((v_subtotal - v_total_item_discounts) * p_cart_discount_value) / 100);
    ELSIF p_cart_discount_type = 'fixed' AND p_cart_discount_value > 0 THEN
        IF v_actor_role = 'cashier' AND (p_cart_discount_value > ((v_subtotal - v_total_item_discounts) * 0.10)) THEN
            RAISE EXCEPTION 'Cashiers cannot apply cart discounts exceeding 10%% of subtotal';
        END IF;
        v_cart_discount := round(p_cart_discount_value);
    END IF;

    IF v_cart_discount > (v_subtotal - v_total_item_discounts) THEN
        v_cart_discount := (v_subtotal - v_total_item_discounts);
    END IF;

    v_total_discount := v_total_item_discounts + v_cart_discount;
    v_total_amount := (v_subtotal - v_total_discount) + v_total_tax;

    -- 7. Process Payments & Due Breakdown
    v_paid_amount := 0;
    FOR v_payment IN SELECT * FROM jsonb_to_recordset(p_payments) AS p(
        method payment_method,
        amount BIGINT,
        reference VARCHAR
    )
    LOOP
        IF v_payment.amount > 0 THEN
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

            v_paid_amount := v_paid_amount + v_payment.amount;
        END IF;
    END LOOP;

    IF v_paid_amount >= v_total_amount THEN
        v_due_amount := 0;
        v_change_amount := v_paid_amount - v_total_amount;
    ELSE
        v_due_amount := v_total_amount - v_paid_amount;
        v_change_amount := 0;

        -- Due sales MUST have an attached customer
        IF p_customer_id IS NULL THEN
            RAISE EXCEPTION 'DUE_SALE_REQUIRES_CUSTOMER: Outstanding due requires an attached customer';
        END IF;

        -- Verify customer credit limit
        SELECT credit_limit INTO v_customer_credit_limit
        FROM customers
        WHERE id = p_customer_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;

        IF v_customer_credit_limit > 0 THEN
            SELECT current_due INTO v_customer_due
            FROM view_customer_balances
            WHERE customer_id = p_customer_id;

            IF (COALESCE(v_customer_due, 0) + v_due_amount) > v_customer_credit_limit THEN
                RAISE EXCEPTION 'Customer credit limit exceeded (limit: %, requested total due: %)',
                    v_customer_credit_limit, (COALESCE(v_customer_due, 0) + v_due_amount);
            END IF;
        END IF;
    END IF;

    -- 8. Save Sales Record
    INSERT INTO sales (
        id,
        tenant_id,
        store_id,
        customer_id,
        cashier_id,
        invoice_number,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        paid_amount,
        due_amount,
        change_amount,
        discount_type,
        discount_rate,
        notes,
        status,
        created_by
    ) VALUES (
        v_sale_id,
        p_tenant_id,
        p_store_id,
        p_customer_id,
        COALESCE(p_cashier_id, v_actor_id),
        v_invoice_number,
        v_subtotal,
        v_total_discount,
        v_total_tax,
        v_total_amount,
        v_paid_amount,
        v_due_amount,
        v_change_amount,
        p_cart_discount_type,
        p_cart_discount_value,
        p_notes,
        'completed',
        v_actor_id
    );

    -- 9. Record Audit Log
    INSERT INTO audit_logs (
        tenant_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_tenant_id,
        v_actor_id,
        'sale.create',
        'sales',
        v_sale_id::text,
        jsonb_build_object(
            'invoice_number', v_invoice_number,
            'total_amount', v_total_amount,
            'paid_amount', v_paid_amount,
            'due_amount', v_due_amount,
            'change_amount', v_change_amount
        )
    );

    RETURN jsonb_build_object(
        'id', v_sale_id,
        'invoice_number', v_invoice_number,
        'subtotal', v_subtotal,
        'discount_amount', v_total_discount,
        'tax_amount', v_total_tax,
        'total_amount', v_total_amount,
        'paid_amount', v_paid_amount,
        'due_amount', v_due_amount,
        'change_amount', v_change_amount,
        'status', 'completed',
        'created_at', now()
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC: fn_return_sale
-- Full or partial return against an existing sale, optional inventory restock,
-- serial status reversion, and append-only ledger write.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_return_sale(
    p_tenant_id UUID,
    p_sale_id UUID,
    p_store_id UUID,
    p_location_id UUID,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_refund_method payment_method DEFAULT 'cash',
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor_id UUID;
    v_sale RECORD;
    v_store_code VARCHAR(20);
    v_seq BIGINT;
    v_return_number VARCHAR(100);
    v_return_id UUID;
    v_item RECORD;
    v_sale_item RECORD;
    v_total_refund BIGINT := 0;
    v_serial TEXT;
    v_previously_returned INTEGER;
    v_remaining_sale_items INTEGER;
BEGIN
    v_actor_id := auth.uid();

    IF NOT is_tenant_member(p_tenant_id) THEN
        RAISE EXCEPTION 'Forbidden: Not a member of this tenant';
    END IF;

    SELECT * INTO v_sale
    FROM sales
    WHERE id = p_sale_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;

    IF v_sale.id IS NULL THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    IF v_sale.status = 'voided' THEN
        RAISE EXCEPTION 'Cannot return a voided sale';
    END IF;

    SELECT code INTO v_store_code
    FROM stores
    WHERE id = p_store_id AND tenant_id = p_tenant_id;

    -- Return sequence
    INSERT INTO branch_invoice_sequences (tenant_id, store_id, prefix, last_seq, updated_at)
    VALUES (p_tenant_id, p_store_id, 'RET', 1, now())
    ON CONFLICT (tenant_id, store_id)
    DO UPDATE SET
        last_seq = branch_invoice_sequences.last_seq + 1,
        updated_at = now()
    RETURNING last_seq INTO v_seq;

    v_return_number := 'RET-' || COALESCE(v_store_code, 'BR') || '-' || lpad(v_seq::text, 6, '0');
    v_return_id := gen_random_uuid();

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        sale_item_id UUID,
        variant_id UUID,
        quantity INTEGER,
        refund_unit_price BIGINT,
        restock BOOLEAN,
        serials JSONB
    )
    LOOP
        SELECT * INTO v_sale_item
        FROM sale_items
        WHERE id = v_item.sale_item_id AND sale_id = p_sale_id;

        IF v_sale_item.id IS NULL THEN
            RAISE EXCEPTION 'Sale item % does not belong to sale %', v_item.sale_item_id, p_sale_id;
        END IF;

        -- Check previously returned quantity
        SELECT COALESCE(SUM(quantity), 0) INTO v_previously_returned
        FROM return_items
        WHERE sale_item_id = v_item.sale_item_id;

        IF (v_previously_returned + v_item.quantity) > v_sale_item.quantity THEN
            RAISE EXCEPTION 'Return quantity % exceeds remaining sold quantity %',
                v_item.quantity, (v_sale_item.quantity - v_previously_returned);
        END IF;

        -- Record return item
        INSERT INTO return_items (
            id,
            tenant_id,
            return_id,
            sale_item_id,
            variant_id,
            quantity,
            refund_unit_price,
            subtotal,
            restock,
            serial_numbers,
            created_by
        ) VALUES (
            gen_random_uuid(),
            p_tenant_id,
            v_return_id,
            v_item.sale_item_id,
            v_item.variant_id,
            v_item.quantity,
            v_item.refund_unit_price,
            v_item.refund_unit_price * v_item.quantity,
            COALESCE(v_item.restock, true),
            CASE WHEN v_item.serials IS NOT NULL THEN
                ARRAY(SELECT jsonb_array_elements_text(v_item.serials))
            ELSE '{}'::text[] END,
            v_actor_id
        );

        v_total_refund := v_total_refund + (v_item.refund_unit_price * v_item.quantity);

        -- Restock inventory if requested
        IF COALESCE(v_item.restock, true) THEN
            INSERT INTO stock_movements (
                tenant_id,
                location_id,
                variant_id,
                type,
                quantity,
                unit_cost,
                reference_id,
                reference_type,
                notes,
                created_by
            ) VALUES (
                p_tenant_id,
                p_location_id,
                v_item.variant_id,
                'return',
                v_item.quantity,
                v_sale_item.unit_cost,
                v_return_id,
                'return',
                'Return ' || v_return_number || ' against sale ' || v_sale.invoice_number,
                v_actor_id
            );
        END IF;

        -- Restore serial status
        IF v_item.serials IS NOT NULL THEN
            FOR v_serial IN SELECT jsonb_array_elements_text(v_item.serials)
            LOOP
                UPDATE product_serials
                SET status = CASE WHEN COALESCE(v_item.restock, true) THEN 'available' ELSE 'returned' END,
                    updated_at = now()
                WHERE tenant_id = p_tenant_id AND variant_id = v_item.variant_id AND serial_number = v_serial;
            END LOOP;
        END IF;
    END LOOP;

    -- Insert return record
    INSERT INTO returns (
        id,
        tenant_id,
        sale_id,
        store_id,
        customer_id,
        return_number,
        refund_amount,
        refund_method,
        reason,
        created_by
    ) VALUES (
        v_return_id,
        p_tenant_id,
        p_sale_id,
        p_store_id,
        v_sale.customer_id,
        v_return_number,
        v_total_refund,
        p_refund_method,
        p_reason,
        v_actor_id
    );

    -- Update original sale status
    SELECT COUNT(*) INTO v_remaining_sale_items
    FROM (
        SELECT si.id, si.quantity - COALESCE(SUM(ri.quantity), 0) AS remaining_qty
        FROM sale_items si
        LEFT JOIN return_items ri ON ri.sale_item_id = si.id
        WHERE si.sale_id = p_sale_id
        GROUP BY si.id, si.quantity
    ) remaining
    WHERE remaining.remaining_qty > 0;

    IF v_remaining_sale_items = 0 THEN
        UPDATE sales SET status = 'returned', updated_at = now() WHERE id = p_sale_id;
    ELSE
        UPDATE sales SET status = 'partially_returned', updated_at = now() WHERE id = p_sale_id;
    END IF;

    -- Audit log
    INSERT INTO audit_logs (
        tenant_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_tenant_id,
        v_actor_id,
        'sale.return',
        'returns',
        v_return_id::text,
        jsonb_build_object(
            'return_number', v_return_number,
            'sale_id', p_sale_id,
            'refund_amount', v_total_refund
        )
    );

    RETURN jsonb_build_object(
        'id', v_return_id,
        'return_number', v_return_number,
        'refund_amount', v_total_refund,
        'created_at', now()
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC: fn_void_sale
-- Manager/Owner only. Reverses inventory movements, restores serial numbers,
-- and flags sale as voided with mandatory reason.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_void_sale(
    p_tenant_id UUID,
    p_sale_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor_id UUID;
    v_sale RECORD;
    v_item RECORD;
    v_default_location_id UUID;
    v_serial TEXT;
BEGIN
    v_actor_id := auth.uid();

    -- Restrict to manager or owner only
    IF NOT has_role(p_tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]) THEN
        RAISE EXCEPTION 'Forbidden: Only managers and owners can void sales';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Void reason is required';
    END IF;

    SELECT * INTO v_sale
    FROM sales
    WHERE id = p_sale_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;

    IF v_sale.id IS NULL THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    IF v_sale.status = 'voided' THEN
        RAISE EXCEPTION 'Sale is already voided';
    END IF;

    -- Resolve default location for store
    SELECT id INTO v_default_location_id
    FROM stock_locations
    WHERE tenant_id = p_tenant_id AND store_id = v_sale.store_id AND is_default = true AND deleted_at IS NULL
    LIMIT 1;

    -- Revert inventory movements for all sale items
    FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id
    LOOP
        INSERT INTO stock_movements (
            tenant_id,
            location_id,
            variant_id,
            type,
            quantity,
            unit_cost,
            reference_id,
            reference_type,
            notes,
            created_by
        ) VALUES (
            p_tenant_id,
            v_default_location_id,
            v_item.variant_id,
            'adjustment',
            v_item.quantity, -- Reversal: add back positive quantity
            v_item.unit_cost,
            p_sale_id,
            'void',
            'Voided sale ' || v_sale.invoice_number || ' - ' || p_reason,
            v_actor_id
        );

        -- Restore serials back to available
        IF v_item.serial_numbers IS NOT NULL AND array_length(v_item.serial_numbers, 1) > 0 THEN
            FOREACH v_serial IN ARRAY v_item.serial_numbers
            LOOP
                UPDATE product_serials
                SET status = 'available',
                    sale_id = NULL,
                    sold_at = NULL,
                    times_sold = GREATEST(0, times_sold - 1),
                    updated_at = now()
                WHERE tenant_id = p_tenant_id AND variant_id = v_item.variant_id AND serial_number = v_serial;
            END LOOP;
        END IF;
    END LOOP;

    -- Mark sale as voided
    UPDATE sales
    SET status = 'voided',
        voided_at = now(),
        voided_by = v_actor_id,
        void_reason = p_reason,
        updated_at = now()
    WHERE id = p_sale_id;

    -- Audit log
    INSERT INTO audit_logs (
        tenant_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_tenant_id,
        v_actor_id,
        'sale.void',
        'sales',
        p_sale_id::text,
        jsonb_build_object(
            'invoice_number', v_sale.invoice_number,
            'reason', p_reason,
            'voided_at', now()
        )
    );

    RETURN jsonb_build_object(
        'id', p_sale_id,
        'status', 'voided',
        'invoice_number', v_sale.invoice_number,
        'voided_at', now()
    );
END;
$$;
