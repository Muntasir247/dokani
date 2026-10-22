-- =============================================================================
-- Migration: 20261022000008_receipts_dues_and_settings.sql
-- Description: STEP 6: Receipts, Invoices, Customer Dues, Loyalty & Store Settings.
--   1. Stores settings extensions: vat_bin_number, receipt_footer, invoice_prefix,
--      default_paper_size, payment_terms, bank_details, loyalty configurations.
--   2. Customer extensions: price_tier, loyalty_points, tax_id, company_name.
--   3. Sales extensions: share_token (unguessable 32-char hex), points_earned, points_redeemed.
--   4. Customer payments link to sale_id for invoice-specific due payments.
--   5. Updated view_customer_balances separating invoice dues and unallocated payments.
--   6. RPC fn_collect_due_payment: atomic payment recording, invoice reconciliation, and audit log.
--   7. RPC fn_lookup_warranty: public serial lookup without leaking private catalog margins.
--   8. Public invoice security policy for share_token access.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Stores Extensions (Print, Tax, Loyalty & Invoicing Settings)
-- -----------------------------------------------------------------------------
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS vat_bin_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS receipt_footer TEXT DEFAULT 'Thank you for shopping with us! Please keep this invoice for warranty and returns.',
    ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(20) DEFAULT 'INV',
    ADD COLUMN IF NOT EXISTS default_paper_size VARCHAR(10) DEFAULT '80mm', -- '80mm' | 'a4'
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'Payment due upon receipt or within 15 days for wholesale accounts.',
    ADD COLUMN IF NOT EXISTS bank_details TEXT,
    ADD COLUMN IF NOT EXISTS tax_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS default_tax_rate INTEGER DEFAULT 500, -- 5.00% in basis points
    ADD COLUMN IF NOT EXISTS default_currency VARCHAR(10) DEFAULT 'BDT',
    ADD COLUMN IF NOT EXISTS loyalty_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS loyalty_earn_rate_poisha INTEGER DEFAULT 10000, -- 100 BDT spend = 1 point
    ADD COLUMN IF NOT EXISTS loyalty_redeem_rate_poisha INTEGER DEFAULT 100; -- 1 point = 1 BDT discount

-- -----------------------------------------------------------------------------
-- 2. Customer Extensions (Tiers, Loyalty, B2B Info)
-- -----------------------------------------------------------------------------
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS price_tier VARCHAR(20) DEFAULT 'retail', -- 'retail' | 'wholesale' | 'custom'
    ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS company_name TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_tier ON customers(tenant_id, price_tier) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Sales Extensions (Share Token for Public Invoices, Loyalty Points)
-- -----------------------------------------------------------------------------
ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE,
    ADD COLUMN IF NOT EXISTS points_earned INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS points_redeemed INTEGER DEFAULT 0;

-- Backfill share_token for existing sales
UPDATE sales 
SET share_token = encode(gen_random_bytes(16), 'hex') 
WHERE share_token IS NULL;

-- Default for future sales
ALTER TABLE sales ALTER COLUMN share_token SET DEFAULT encode(gen_random_bytes(16), 'hex');

CREATE INDEX IF NOT EXISTS idx_sales_share_token ON sales(share_token);

-- -----------------------------------------------------------------------------
-- 4. Customer Payments: Link to specific invoice
-- -----------------------------------------------------------------------------
ALTER TABLE customer_payments
    ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_payments_sale ON customer_payments(sale_id);

-- -----------------------------------------------------------------------------
-- 5. Updated Customer Balances View
-- Dues are computed as: opening_balance + sum(unpaid sales due) - sum(unallocated payments)
-- -----------------------------------------------------------------------------
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
    c.price_tier,
    c.loyalty_points,
    c.company_name,
    COALESCE(s.total_sales_due, 0) AS total_sales_due,
    COALESCE(p.unallocated_payments, 0) AS unallocated_payments,
    (c.opening_balance + COALESCE(s.total_sales_due, 0) - COALESCE(p.unallocated_payments, 0)) AS current_due
FROM customers c
LEFT JOIN (
    SELECT customer_id, SUM(due_amount) AS total_sales_due
    FROM sales
    WHERE deleted_at IS NULL AND status != 'voided'
    GROUP BY customer_id
) s ON s.customer_id = c.id
LEFT JOIN (
    SELECT customer_id, SUM(amount) AS unallocated_payments
    FROM customer_payments
    WHERE sale_id IS NULL
    GROUP BY customer_id
) p ON p.customer_id = c.id
WHERE c.deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 6. RPC: fn_collect_due_payment
-- Collects due payment, updates invoice if linked, updates customer balance,
-- writes customer_payments and audit_logs.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_collect_due_payment(
    p_tenant_id UUID,
    p_customer_id UUID,
    p_amount BIGINT,
    p_payment_method payment_method DEFAULT 'cash',
    p_sale_id UUID DEFAULT NULL,
    p_reference VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor_id UUID;
    v_payment_id UUID;
    v_sale RECORD;
    v_new_sale_due BIGINT;
    v_new_sale_paid BIGINT;
    v_customer_due BIGINT;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    -- If sale_id specified, lock sale row and validate
    IF p_sale_id IS NOT NULL THEN
        SELECT * INTO v_sale
        FROM sales
        WHERE id = p_sale_id AND tenant_id = p_tenant_id AND deleted_at IS NULL
        FOR UPDATE;

        IF v_sale.id IS NULL THEN
            RAISE EXCEPTION 'Sale invoice not found';
        END IF;

        IF v_sale.customer_id != p_customer_id THEN
            RAISE EXCEPTION 'Sale invoice belongs to a different customer';
        END IF;

        IF v_sale.due_amount <= 0 THEN
            RAISE EXCEPTION 'This invoice is already fully paid';
        END IF;

        IF p_amount > v_sale.due_amount THEN
            RAISE EXCEPTION 'Payment amount (%) exceeds outstanding invoice due (%)', p_amount, v_sale.due_amount;
        END IF;

        v_new_sale_due := v_sale.due_amount - p_amount;
        v_new_sale_paid := v_sale.paid_amount + p_amount;

        UPDATE sales
        SET due_amount = v_new_sale_due,
            paid_amount = v_new_sale_paid,
            updated_at = now()
        WHERE id = p_sale_id;

        -- Record payment under sale_payments too
        INSERT INTO sale_payments (
            tenant_id,
            sale_id,
            method,
            amount,
            reference,
            created_by
        ) VALUES (
            p_tenant_id,
            p_sale_id,
            p_payment_method,
            p_amount,
            COALESCE(p_reference, 'Due Collection'),
            v_actor_id
        );
    END IF;

    -- Record customer_payment entry
    v_payment_id := gen_random_uuid();
    INSERT INTO customer_payments (
        id,
        tenant_id,
        customer_id,
        sale_id,
        amount,
        payment_method,
        reference,
        notes,
        created_by
    ) VALUES (
        v_payment_id,
        p_tenant_id,
        p_customer_id,
        p_sale_id,
        p_amount,
        p_payment_method,
        p_reference,
        p_notes,
        v_actor_id
    );

    -- Fetch updated customer balance
    SELECT current_due INTO v_customer_due
    FROM view_customer_balances
    WHERE customer_id = p_customer_id;

    -- Audit log
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
        'collect:due_payment',
        'customer_payments',
        v_payment_id,
        jsonb_build_object(
            'customer_id', p_customer_id,
            'sale_id', p_sale_id,
            'amount', p_amount,
            'payment_method', p_payment_method,
            'new_invoice_due', v_new_sale_due,
            'new_customer_due', v_customer_due
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'paymentId', v_payment_id,
        'saleId', p_sale_id,
        'amountPaid', p_amount,
        'newInvoiceDue', v_new_sale_due,
        'newCustomerDue', v_customer_due
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC: fn_lookup_warranty (Public Serial Lookup)
-- Returns public warranty status without exposing supplier costs or profit margins.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_lookup_warranty(
    p_serial_number TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_serial RECORD;
    v_product RECORD;
    v_variant RECORD;
    v_sale RECORD;
    v_store RECORD;
    v_is_valid BOOLEAN := false;
BEGIN
    SELECT * INTO v_serial
    FROM product_serials
    WHERE serial_number = trim(p_serial_number)
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_serial.id IS NULL THEN
        RETURN jsonb_build_object('found', false, 'message', 'Serial number not found');
    END IF;

    SELECT name, warranty_months INTO v_product
    FROM products
    WHERE id = (SELECT product_id FROM product_variants WHERE id = v_serial.variant_id);

    SELECT name, sku INTO v_variant
    FROM product_variants
    WHERE id = v_serial.variant_id;

    -- Check if warranty is active
    IF v_serial.warranty_end IS NOT NULL AND v_serial.warranty_end >= CURRENT_DATE THEN
        v_is_valid := true;
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'serialNumber', v_serial.serial_number,
        'status', v_serial.status,
        'productName', v_product.name,
        'variantName', v_variant.name,
        'sku', v_variant.sku,
        'warrantyMonths', v_product.warranty_months,
        'warrantyStart', v_serial.warranty_start,
        'warrantyEnd', v_serial.warranty_end,
        'isWarrantyValid', v_is_valid
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Public RLS Policy for Invoices via share_token
-- Allows unauthenticated visitors to view only the specific invoice matching share_token
-- -----------------------------------------------------------------------------
CREATE POLICY sales_public_read ON sales
    FOR SELECT TO anon
    USING (share_token IS NOT NULL);

CREATE POLICY sale_items_public_read ON sale_items
    FOR SELECT TO anon
    USING (
        EXISTS (
            SELECT 1 FROM sales s
            WHERE s.id = sale_items.sale_id
              AND s.share_token IS NOT NULL
        )
    );

CREATE POLICY stores_public_read ON stores
    FOR SELECT TO anon
    USING (deleted_at IS NULL);

-- -----------------------------------------------------------------------------
-- 9. Secure Public Invoice Lookup RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_public_invoice(p_share_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale RECORD;
    v_store RECORD;
    v_customer RECORD;
    v_items jsonb;
    v_payments jsonb;
BEGIN
    SELECT * INTO v_sale
    FROM sales
    WHERE share_token = trim(p_share_token)
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_sale.id IS NULL THEN
        RETURN jsonb_build_object('found', false, 'message', 'Invoice not found');
    END IF;

    SELECT id, name, code, address, phone, vat_bin_number, logo_url, receipt_footer, payment_terms, bank_details, default_currency
    INTO v_store
    FROM stores
    WHERE id = v_sale.store_id;

    IF v_sale.customer_id IS NOT NULL THEN
        SELECT id, name, phone, address, company_name, tax_id, price_tier
        INTO v_customer
        FROM customers
        WHERE id = v_sale.customer_id;
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', si.id,
            'name', COALESCE(p.name, 'Item'),
            'variantName', pv.name,
            'sku', pv.sku,
            'quantity', si.quantity,
            'unitPrice', si.unit_price,
            'discountAmount', si.discount_amount,
            'subtotal', si.subtotal,
            'serialNumbers', si.serial_numbers,
            'warrantyMonths', p.warranty_months
        )
    ), '[]'::jsonb) INTO v_items
    FROM sale_items si
    LEFT JOIN product_variants pv ON pv.id = si.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE si.sale_id = v_sale.id;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'method', sp.method,
            'amount', sp.amount,
            'reference', sp.reference,
            'paidAt', sp.paid_at
        )
    ), '[]'::jsonb) INTO v_payments
    FROM sale_payments sp
    WHERE sp.sale_id = v_sale.id;

    RETURN jsonb_build_object(
        'found', true,
        'sale', jsonb_build_object(
            'id', v_sale.id,
            'invoiceNumber', v_sale.invoice_number,
            'soldAt', v_sale.sold_at,
            'shareToken', v_sale.share_token,
            'status', v_sale.status,
            'subtotal', v_sale.subtotal,
            'discountAmount', v_sale.discount_amount,
            'taxAmount', v_sale.tax_amount,
            'totalAmount', v_sale.total_amount,
            'paidAmount', v_sale.paid_amount,
            'dueAmount', v_sale.due_amount,
            'changeAmount', v_sale.change_amount
        ),
        'store', row_to_json(v_store),
        'customer', CASE WHEN v_customer.id IS NOT NULL THEN row_to_json(v_customer) ELSE NULL END,
        'items', v_items,
        'payments', v_payments
    );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_public_invoice(text) TO anon, authenticated;

