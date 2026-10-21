-- =============================================================================
-- Migration: 20261022000002_stock_ledger_views.sql
-- Description: Derived stock balance views and helper functions for Dokani POS
-- The stock quantity is NEVER a mutable column; it is always derived from the
-- append-only stock_movements ledger.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. View: view_current_stock
-- Real-time stock balance aggregated from immutable stock_movements.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_current_stock AS
SELECT
    sm.tenant_id,
    sm.location_id,
    sl.store_id,
    st.name AS store_name,
    sl.name AS location_name,
    sm.variant_id,
    p.id AS product_id,
    p.name AS product_name,
    pv.name AS variant_name,
    pv.sku,
    pv.barcode,
    pv.cost_price,
    pv.retail_price,
    pv.reorder_point,
    -- Aggregate stock calculation:
    COALESCE(SUM(sm.quantity), 0)::INTEGER AS current_stock,
    -- Detailed breakdown by ledger transaction type:
    COALESCE(SUM(CASE WHEN sm.type = 'purchase' THEN sm.quantity ELSE 0 END), 0)::INTEGER AS total_purchased,
    COALESCE(SUM(CASE WHEN sm.type = 'sale' THEN ABS(sm.quantity) ELSE 0 END), 0)::INTEGER AS total_sold,
    COALESCE(SUM(CASE WHEN sm.type = 'return' THEN sm.quantity ELSE 0 END), 0)::INTEGER AS total_returned,
    COALESCE(SUM(CASE WHEN sm.type = 'adjustment' THEN sm.quantity ELSE 0 END), 0)::INTEGER AS total_adjusted,
    COALESCE(SUM(CASE WHEN sm.type = 'transfer_in' THEN sm.quantity ELSE 0 END), 0)::INTEGER AS total_transferred_in,
    COALESCE(SUM(CASE WHEN sm.type = 'transfer_out' THEN ABS(sm.quantity) ELSE 0 END), 0)::INTEGER AS total_transferred_out,
    MAX(sm.created_at) AS last_movement_at,
    -- Reorder alert flag
    (COALESCE(SUM(sm.quantity), 0) <= pv.reorder_point) AS is_low_stock
FROM stock_movements sm
JOIN product_variants pv ON pv.id = sm.variant_id AND pv.deleted_at IS NULL
JOIN products p ON p.id = pv.product_id AND p.deleted_at IS NULL
JOIN stock_locations sl ON sl.id = sm.location_id AND sl.deleted_at IS NULL
JOIN stores st ON st.id = sl.store_id AND st.deleted_at IS NULL
WHERE sm.deleted_at IS NULL
GROUP BY
    sm.tenant_id,
    sm.location_id,
    sl.store_id,
    st.name,
    sl.name,
    sm.variant_id,
    p.id,
    p.name,
    pv.name,
    pv.sku,
    pv.barcode,
    pv.cost_price,
    pv.retail_price,
    pv.reorder_point;

-- -----------------------------------------------------------------------------
-- 2. Stored Function: fn_get_stock_quantity
-- Fast query for the current stock of a variant, optionally scoped to a location.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_stock_quantity(
    p_tenant_id UUID,
    p_variant_id UUID,
    p_location_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_qty INTEGER;
BEGIN
    SELECT COALESCE(SUM(quantity), 0)::INTEGER
    INTO v_qty
    FROM stock_movements
    WHERE tenant_id = p_tenant_id
      AND variant_id = p_variant_id
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND deleted_at IS NULL;

    RETURN v_qty;
END;
$$ LANGUAGE plpgsql STABLE;

-- -----------------------------------------------------------------------------
-- 3. Stored Function: fn_has_sufficient_stock
-- Validates if requested quantity can be fulfilled from a location.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_has_sufficient_stock(
    p_tenant_id UUID,
    p_location_id UUID,
    p_variant_id UUID,
    p_requested_quantity INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_stock INTEGER;
BEGIN
    v_current_stock := fn_get_stock_quantity(p_tenant_id, p_variant_id, p_location_id);
    RETURN v_current_stock >= p_requested_quantity;
END;
$$ LANGUAGE plpgsql STABLE;
