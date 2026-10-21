-- =============================================================================
-- Migration: 20261022000005_catalog_and_inventory.sql
-- Description: Product catalog enhancements, serial single-sale constraint,
--              supplier balance tracking, and atomic stock ledger operations
--              (purchase receiving with WAC, adjustments, stock take, transfers).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema Extensions for Products, Variants, Serials, Suppliers
-- -----------------------------------------------------------------------------

-- Products: add image URL and default warranty period in months
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS warranty_months INTEGER NOT NULL DEFAULT 0;

-- Product Variants: add image URL and options JSONB (for size, color, etc.)
ALTER TABLE product_variants
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Product Serials: add warranty, times_sold, sold_at, and sale linkage
ALTER TABLE product_serials
    ADD COLUMN IF NOT EXISTS warranty_months INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS times_sold INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sale_item_id UUID REFERENCES sale_items(id) ON DELETE SET NULL;

-- Suppliers: add opening balance (poisha)
ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS opening_balance BIGINT NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. Database-Level Invariant: A serial can NEVER be sold twice
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_serial_sale_rules()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'sold' THEN
            NEW.times_sold := 1;
            NEW.sold_at := COALESCE(NEW.sold_at, now());
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- When attempting to mark a serial as sold
        IF NEW.status = 'sold' THEN
            -- Cannot sell if it is already in 'sold' status
            IF OLD.status = 'sold' THEN
                RAISE EXCEPTION 'Serial number % is already sold and cannot be sold again', NEW.serial_number;
            END IF;
            -- Cannot sell if it has already been sold in the past (even if returned/rma)
            IF OLD.times_sold > 0 THEN
                RAISE EXCEPTION 'Serial number % was previously sold and cannot be sold twice', NEW.serial_number;
            END IF;

            NEW.times_sold := OLD.times_sold + 1;
            NEW.sold_at := COALESCE(NEW.sold_at, now());
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_serial_sale_rules ON product_serials;
CREATE TRIGGER trg_check_serial_sale_rules
BEFORE INSERT OR UPDATE ON product_serials
FOR EACH ROW
EXECUTE FUNCTION fn_check_serial_sale_rules();

-- -----------------------------------------------------------------------------
-- 3. Supplier Balance & Due Tracking View
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_supplier_balances AS
SELECT
    s.id AS supplier_id,
    s.tenant_id,
    s.name,
    s.company,
    s.phone,
    s.email,
    s.address,
    s.opening_balance,
    COALESCE(SUM(p.total_cost), 0)::BIGINT AS total_purchased,
    COALESCE(SUM(p.paid_amount), 0)::BIGINT AS total_paid,
    -- Current due in poisha: opening balance + (purchases total cost - purchases paid amount)
    (s.opening_balance + COALESCE(SUM(p.total_cost - p.paid_amount), 0))::BIGINT AS current_due,
    MAX(p.created_at) AS last_purchase_at
FROM suppliers s
LEFT JOIN purchases p ON p.supplier_id = s.id AND p.deleted_at IS NULL
WHERE s.deleted_at IS NULL
GROUP BY s.id, s.tenant_id, s.name, s.company, s.phone, s.email, s.address, s.opening_balance;

-- -----------------------------------------------------------------------------
-- 4. Atomic RPC: fn_receive_purchase
-- Receives a purchase order, writes to ledger, calculates Weighted Average Cost (WAC),
-- registers serials if applicable, and updates supplier due.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_receive_purchase(
    p_tenant_id UUID,
    p_store_id UUID,
    p_supplier_id UUID,
    p_invoice_number TEXT,
    p_items JSONB, -- Array of { variant_id: UUID, quantity: INT, unit_cost: BIGINT, serials?: TEXT[] }
    p_paid_amount BIGINT DEFAULT 0,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_location_id UUID;
    v_purchase_id UUID;
    v_total_cost BIGINT := 0;
    v_item JSONB;
    v_variant_id UUID;
    v_quantity INTEGER;
    v_unit_cost BIGINT;
    v_subtotal BIGINT;
    v_serials JSONB;
    v_serial_text TEXT;
    v_pre_stock INTEGER;
    v_current_cost BIGINT;
    v_new_cost BIGINT;
    v_warranty_months INTEGER;
BEGIN
    -- Verify caller has manager/owner role
    IF NOT has_role(p_tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]) THEN
        RAISE EXCEPTION 'Unauthorized: only owners and managers can receive purchases';
    END IF;

    -- Resolve default stock location for the store
    SELECT id INTO v_location_id
    FROM stock_locations
    WHERE tenant_id = p_tenant_id
      AND store_id = p_store_id
      AND is_default = true
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_location_id IS NULL THEN
        SELECT id INTO v_location_id
        FROM stock_locations
        WHERE tenant_id = p_tenant_id
          AND store_id = p_store_id
          AND deleted_at IS NULL
        LIMIT 1;
    END IF;

    IF v_location_id IS NULL THEN
        RAISE EXCEPTION 'No stock location found for store %', p_store_id;
    END IF;

    -- Calculate total cost
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'unit_cost')::BIGINT;
        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'Quantity must be positive for all purchase items';
        END IF;
        IF v_unit_cost < 0 THEN
            RAISE EXCEPTION 'Unit cost cannot be negative';
        END IF;
        v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
    END LOOP;

    -- 1. Create Purchase record
    INSERT INTO purchases (
        tenant_id,
        store_id,
        supplier_id,
        invoice_number,
        total_cost,
        paid_amount,
        notes,
        created_by
    ) VALUES (
        p_tenant_id,
        p_store_id,
        p_supplier_id,
        p_invoice_number,
        v_total_cost,
        p_paid_amount,
        p_notes,
        v_user_id
    ) RETURNING id INTO v_purchase_id;

    -- 2. Process each purchase item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'unit_cost')::BIGINT;
        v_subtotal := v_quantity * v_unit_cost;
        v_serials := v_item->'serials';

        -- Read current stock before this transaction
        v_pre_stock := fn_get_stock_quantity(p_tenant_id, v_variant_id, v_location_id);

        -- Read current cost & product warranty
        SELECT pv.cost_price, p.warranty_months
        INTO v_current_cost, v_warranty_months
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.id = v_variant_id;

        -- Calculate Weighted Average Cost (WAC)
        IF v_pre_stock <= 0 THEN
            v_new_cost := v_unit_cost;
        ELSE
            v_new_cost := ROUND(((v_pre_stock * v_current_cost) + (v_quantity * v_unit_cost))::NUMERIC / (v_pre_stock + v_quantity));
        END IF;

        -- Update variant cost price
        UPDATE product_variants
        SET cost_price = v_new_cost,
            updated_at = now()
        WHERE id = v_variant_id;

        -- Insert purchase item
        INSERT INTO purchase_items (
            tenant_id,
            purchase_id,
            variant_id,
            quantity,
            unit_cost,
            subtotal,
            created_by
        ) VALUES (
            p_tenant_id,
            v_purchase_id,
            v_variant_id,
            v_quantity,
            v_unit_cost,
            v_subtotal,
            v_user_id
        );

        -- Insert stock movement (append-only ledger)
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
            v_location_id,
            v_variant_id,
            'purchase',
            v_quantity,
            v_unit_cost,
            v_purchase_id,
            'purchase',
            'Purchase invoice: ' || p_invoice_number,
            v_user_id
        );

        -- Insert serial numbers if provided
        IF v_serials IS NOT NULL AND jsonb_typeof(v_serials) = 'array' AND jsonb_array_length(v_serials) > 0 THEN
            FOR v_serial_text IN SELECT jsonb_array_elements_text(v_serials)
            LOOP
                IF trim(v_serial_text) != '' THEN
                    INSERT INTO product_serials (
                        tenant_id,
                        variant_id,
                        stock_location_id,
                        serial_number,
                        status,
                        warranty_months,
                        created_by
                    ) VALUES (
                        p_tenant_id,
                        v_variant_id,
                        v_location_id,
                        trim(v_serial_text),
                        'available',
                        COALESCE(v_warranty_months, 0),
                        v_user_id
                    )
                    ON CONFLICT (tenant_id, variant_id, serial_number)
                    DO UPDATE SET
                        status = 'available',
                        stock_location_id = v_location_id,
                        updated_at = now();
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    -- Audit log
    INSERT INTO audit_logs (
        tenant_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_tenant_id,
        v_user_id,
        'purchase_received',
        'purchases',
        v_purchase_id,
        jsonb_build_object(
            'invoice_number', p_invoice_number,
            'total_cost', v_total_cost,
            'paid_amount', p_paid_amount,
            'supplier_id', p_supplier_id,
            'item_count', jsonb_array_length(p_items)
        )
    );

    RETURN jsonb_build_object(
        'purchase_id', v_purchase_id,
        'invoice_number', p_invoice_number,
        'total_cost', v_total_cost,
        'paid_amount', p_paid_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 5. Atomic RPC: fn_adjust_stock
-- Manual stock adjustment with required reason. Writes directly to stock_movements ledger.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_adjust_stock(
    p_tenant_id UUID,
    p_location_id UUID,
    p_variant_id UUID,
    p_delta_quantity INTEGER,
    p_reason TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_cost BIGINT;
    v_new_stock INTEGER;
BEGIN
    IF NOT has_role(p_tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]) THEN
        RAISE EXCEPTION 'Unauthorized: only owners and managers can adjust stock';
    END IF;

    IF p_delta_quantity = 0 THEN
        RAISE EXCEPTION 'Adjustment delta quantity cannot be zero';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Adjustment reason is required';
    END IF;

    -- Get variant current cost
    SELECT cost_price INTO v_cost
    FROM product_variants
    WHERE id = p_variant_id AND tenant_id = p_tenant_id;

    IF v_cost IS NULL THEN
        RAISE EXCEPTION 'Product variant not found';
    END IF;

    -- Insert into stock_movements
    INSERT INTO stock_movements (
        tenant_id,
        location_id,
        variant_id,
        type,
        quantity,
        unit_cost,
        reference_type,
        notes,
        created_by
    ) VALUES (
        p_tenant_id,
        p_location_id,
        p_variant_id,
        'adjustment',
        p_delta_quantity,
        v_cost,
        'adjustment',
        '[' || p_reason || ']' || COALESCE(': ' || p_notes, ''),
        v_user_id
    );

    -- Calculate updated stock
    v_new_stock := fn_get_stock_quantity(p_tenant_id, p_variant_id, p_location_id);

    -- Audit log
    INSERT INTO audit_logs (
        tenant_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_tenant_id,
        v_user_id,
        'stock_adjusted',
        'product_variants',
        p_variant_id,
        jsonb_build_object(
            'location_id', p_location_id,
            'delta_quantity', p_delta_quantity,
            'reason', p_reason,
            'notes', p_notes,
            'new_stock', v_new_stock
        )
    );

    RETURN jsonb_build_object(
        'variant_id', p_variant_id,
        'location_id', p_location_id,
        'delta_quantity', p_delta_quantity,
        'new_stock', v_new_stock
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 6. Atomic RPC: fn_stock_take
-- Stock take / cycle count: user specifies physical counted quantity,
-- system calculates discrepancy, and inserts an adjustment movement.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_stock_take(
    p_tenant_id UUID,
    p_location_id UUID,
    p_variant_id UUID,
    p_counted_quantity INTEGER,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_current_stock INTEGER;
    v_delta INTEGER;
    v_cost BIGINT;
BEGIN
    IF NOT has_role(p_tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]) THEN
        RAISE EXCEPTION 'Unauthorized: only owners and managers can perform stock takes';
    END IF;

    IF p_counted_quantity < 0 THEN
        RAISE EXCEPTION 'Counted quantity cannot be negative';
    END IF;

    -- Query current stock balance from ledger
    v_current_stock := fn_get_stock_quantity(p_tenant_id, p_variant_id, p_location_id);
    v_delta := p_counted_quantity - v_current_stock;

    IF v_delta != 0 THEN
        -- Get current cost
        SELECT cost_price INTO v_cost
        FROM product_variants
        WHERE id = p_variant_id AND tenant_id = p_tenant_id;

        -- Write reconciling adjustment movement
        INSERT INTO stock_movements (
            tenant_id,
            location_id,
            variant_id,
            type,
            quantity,
            unit_cost,
            reference_type,
            notes,
            created_by
        ) VALUES (
            p_tenant_id,
            p_location_id,
            p_variant_id,
            'adjustment',
            v_delta,
            COALESCE(v_cost, 0),
            'stock_take',
            'Stock take reconciliation (Physical: ' || p_counted_quantity || ', System: ' || v_current_stock || ')' || COALESCE('. ' || p_notes, ''),
            v_user_id
        );

        -- Audit log
        INSERT INTO audit_logs (
            tenant_id,
            user_id,
            action,
            entity_type,
            entity_id,
            new_values
        ) VALUES (
            p_tenant_id,
            v_user_id,
            'stock_take',
            'product_variants',
            p_variant_id,
            jsonb_build_object(
                'location_id', p_location_id,
                'prior_stock', v_current_stock,
                'counted_stock', p_counted_quantity,
                'delta', v_delta,
                'notes', p_notes
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'variant_id', p_variant_id,
        'location_id', p_location_id,
        'counted_stock', p_counted_quantity,
        'prior_stock', v_current_stock,
        'delta', v_delta
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 7. Atomic RPC: fn_transfer_stock
-- Inter-branch / inter-location stock transfer with serials re-assignment.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_transfer_stock(
    p_tenant_id UUID,
    p_from_location_id UUID,
    p_to_location_id UUID,
    p_variant_id UUID,
    p_quantity INTEGER,
    p_serials TEXT[] DEFAULT '{}',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_cost BIGINT;
    v_transfer_id UUID := gen_random_uuid();
    v_from_stock INTEGER;
BEGIN
    IF NOT has_role(p_tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]) THEN
        RAISE EXCEPTION 'Unauthorized: only owners and managers can transfer stock';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Transfer quantity must be positive';
    END IF;

    IF p_from_location_id = p_to_location_id THEN
        RAISE EXCEPTION 'Source and destination locations cannot be the same';
    END IF;

    -- Check source location has sufficient stock
    IF NOT fn_has_sufficient_stock(p_tenant_id, p_from_location_id, p_variant_id, p_quantity) THEN
        v_from_stock := fn_get_stock_quantity(p_tenant_id, p_variant_id, p_from_location_id);
        RAISE EXCEPTION 'Insufficient stock at source location (Available: %, Requested: %)', v_from_stock, p_quantity;
    END IF;

    -- Get variant cost
    SELECT cost_price INTO v_cost
    FROM product_variants
    WHERE id = p_variant_id AND tenant_id = p_tenant_id;

    -- 1. Transfer Out movement from source location
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
        p_from_location_id,
        p_variant_id,
        'transfer_out',
        -p_quantity,
        COALESCE(v_cost, 0),
        v_transfer_id,
        'transfer',
        'Transfer to location ' || p_to_location_id || COALESCE(': ' || p_notes, ''),
        v_user_id
    );

    -- 2. Transfer In movement into destination location
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
        p_to_location_id,
        p_variant_id,
        'transfer_in',
        p_quantity,
        COALESCE(v_cost, 0),
        v_transfer_id,
        'transfer',
        'Transfer from location ' || p_from_location_id || COALESCE(': ' || p_notes, ''),
        v_user_id
    );

    -- 3. Re-assign serials location if serials specified
    IF p_serials IS NOT NULL AND array_length(p_serials, 1) > 0 THEN
        UPDATE product_serials
        SET stock_location_id = p_to_location_id,
            updated_at = now()
        WHERE tenant_id = p_tenant_id
          AND variant_id = p_variant_id
          AND serial_number = ANY(p_serials)
          AND stock_location_id = p_from_location_id;
    END IF;

    -- Audit log
    INSERT INTO audit_logs (
        tenant_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_tenant_id,
        v_user_id,
        'stock_transferred',
        'stock_movements',
        v_transfer_id,
        jsonb_build_object(
            'from_location_id', p_from_location_id,
            'to_location_id', p_to_location_id,
            'variant_id', p_variant_id,
            'quantity', p_quantity,
            'serials', p_serials,
            'notes', p_notes
        )
    );

    RETURN jsonb_build_object(
        'transfer_id', v_transfer_id,
        'from_location_id', p_from_location_id,
        'to_location_id', p_to_location_id,
        'quantity', p_quantity
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
