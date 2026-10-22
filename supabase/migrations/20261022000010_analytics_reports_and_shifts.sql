-- =============================================================================
-- Migration 10: Analytics, Reports, Cash Drawer Shifts, and Notifications
-- Step 8 of Dokani POS SaaS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Cash Drawer Shifts & Sessions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_drawer_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    cashier_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    opening_float_poisha BIGINT NOT NULL DEFAULT 0 CHECK (opening_float_poisha >= 0),
    closing_counted_poisha BIGINT,
    expected_cash_poisha BIGINT,
    cash_variance_poisha BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_drawer_tenant_store ON cash_drawer_sessions(tenant_id, store_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_cashier ON cash_drawer_sessions(tenant_id, cashier_id, opened_at DESC);

-- Cash In / Cash Out drawer transactions during shift
CREATE TABLE IF NOT EXISTS cash_drawer_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES cash_drawer_sessions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('cash_in', 'cash_out')),
    amount_poisha BIGINT NOT NULL CHECK (amount_poisha > 0),
    reason TEXT NOT NULL,
    performed_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_drawer_tx_session ON cash_drawer_transactions(session_id, created_at ASC);

-- -----------------------------------------------------------------------------
-- 2. Pre-Aggregated Daily Sales Table (Sub-50ms Dashboard Performance)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_sales_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sale_date DATE NOT NULL,
    total_invoices INT NOT NULL DEFAULT 0,
    total_revenue_poisha BIGINT NOT NULL DEFAULT 0,
    total_cost_poisha BIGINT NOT NULL DEFAULT 0,
    total_gross_profit_poisha BIGINT NOT NULL DEFAULT 0,
    total_discount_poisha BIGINT NOT NULL DEFAULT 0,
    total_tax_poisha BIGINT NOT NULL DEFAULT 0,
    total_paid_poisha BIGINT NOT NULL DEFAULT 0,
    total_due_poisha BIGINT NOT NULL DEFAULT 0,
    cash_paid_poisha BIGINT NOT NULL DEFAULT 0,
    bkash_paid_poisha BIGINT NOT NULL DEFAULT 0,
    nagad_paid_poisha BIGINT NOT NULL DEFAULT 0,
    card_paid_poisha BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_daily_sales_tenant_store_date UNIQUE (tenant_id, store_id, sale_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_sales_tenant_date ON daily_sales_aggregates(tenant_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_sales_store_date ON daily_sales_aggregates(tenant_id, store_id, sale_date DESC);

-- High-performance composite indexes on sales and related tables
CREATE INDEX IF NOT EXISTS idx_sales_tenant_sold_at_desc ON sales(tenant_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_store_sold_at ON sales(tenant_id, store_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_cashier_sold_at ON sales(tenant_id, cashier_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_tenant_variant ON sale_items(tenant_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id_subtotal ON sale_items(sale_id, subtotal);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_method ON sale_payments(sale_id, method, amount);

-- -----------------------------------------------------------------------------
-- 3. In-App & Email Notifications Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('low_stock', 'large_discount', 'daily_summary', 'shift_variance', 'system')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_read ON notifications(tenant_id, is_read, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Automatic Incremental Trigger for Daily Sales Aggregates
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recompute_daily_sales_aggregate(
    p_tenant_id UUID,
    p_store_id UUID,
    p_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoices INT := 0;
    v_revenue BIGINT := 0;
    v_cost BIGINT := 0;
    v_profit BIGINT := 0;
    v_discount BIGINT := 0;
    v_tax BIGINT := 0;
    v_paid BIGINT := 0;
    v_due BIGINT := 0;
    v_cash BIGINT := 0;
    v_bkash BIGINT := 0;
    v_nagad BIGINT := 0;
    v_card BIGINT := 0;
BEGIN
    -- Aggregate from sales table for this day
    SELECT
        COUNT(*),
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(discount_amount), 0),
        COALESCE(SUM(tax_amount), 0),
        COALESCE(SUM(paid_amount), 0),
        COALESCE(SUM(due_amount), 0)
    INTO
        v_invoices,
        v_revenue,
        v_discount,
        v_tax,
        v_paid,
        v_due
    FROM sales
    WHERE tenant_id = p_tenant_id
      AND store_id = p_store_id
      AND sold_at::DATE = p_date
      AND status = 'completed'
      AND deleted_at IS NULL;

    -- Aggregate cost from sale_items
    SELECT
        COALESCE(SUM(si.quantity * si.unit_cost), 0)
    INTO
        v_cost
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.tenant_id = p_tenant_id
      AND s.store_id = p_store_id
      AND s.sold_at::DATE = p_date
      AND s.status = 'completed'
      AND s.deleted_at IS NULL;

    v_profit := v_revenue - v_cost;

    -- Aggregate payment breakdown
    SELECT
        COALESCE(SUM(CASE WHEN sp.method = 'cash' THEN sp.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sp.method = 'bkash' THEN sp.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sp.method = 'nagad' THEN sp.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sp.method = 'card' THEN sp.amount ELSE 0 END), 0)
    INTO
        v_cash,
        v_bkash,
        v_nagad,
        v_card
    FROM sale_payments sp
    JOIN sales s ON s.id = sp.sale_id
    WHERE s.tenant_id = p_tenant_id
      AND s.store_id = p_store_id
      AND s.sold_at::DATE = p_date
      AND s.status = 'completed'
      AND s.deleted_at IS NULL;

    -- Upsert pre-aggregated record
    INSERT INTO daily_sales_aggregates (
        tenant_id,
        store_id,
        sale_date,
        total_invoices,
        total_revenue_poisha,
        total_cost_poisha,
        total_gross_profit_poisha,
        total_discount_poisha,
        total_tax_poisha,
        total_paid_poisha,
        total_due_poisha,
        cash_paid_poisha,
        bkash_paid_poisha,
        nagad_paid_poisha,
        card_paid_poisha,
        updated_at
    )
    VALUES (
        p_tenant_id,
        p_store_id,
        p_date,
        v_invoices,
        v_revenue,
        v_cost,
        v_profit,
        v_discount,
        v_tax,
        v_paid,
        v_due,
        v_cash,
        v_bkash,
        v_nagad,
        v_card,
        now()
    )
    ON CONFLICT (tenant_id, store_id, sale_date)
    DO UPDATE SET
        total_invoices = EXCLUDED.total_invoices,
        total_revenue_poisha = EXCLUDED.total_revenue_poisha,
        total_cost_poisha = EXCLUDED.total_cost_poisha,
        total_gross_profit_poisha = EXCLUDED.total_gross_profit_poisha,
        total_discount_poisha = EXCLUDED.total_discount_poisha,
        total_tax_poisha = EXCLUDED.total_tax_poisha,
        total_paid_poisha = EXCLUDED.total_paid_poisha,
        total_due_poisha = EXCLUDED.total_due_poisha,
        cash_paid_poisha = EXCLUDED.cash_paid_poisha,
        bkash_paid_poisha = EXCLUDED.bkash_paid_poisha,
        nagad_paid_poisha = EXCLUDED.nagad_paid_poisha,
        card_paid_poisha = EXCLUDED.card_paid_poisha,
        updated_at = now();
END;
$$;

-- Trigger to recompute daily aggregate automatically when sales complete or void
CREATE OR REPLACE FUNCTION trg_fn_sync_daily_sales_aggregate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        PERFORM fn_recompute_daily_sales_aggregate(NEW.tenant_id, NEW.store_id, NEW.sold_at::DATE);
    ELSIF (TG_OP = 'UPDATE') THEN
        PERFORM fn_recompute_daily_sales_aggregate(NEW.tenant_id, NEW.store_id, NEW.sold_at::DATE);
        IF (OLD.sold_at::DATE <> NEW.sold_at::DATE OR OLD.store_id <> NEW.store_id) THEN
            PERFORM fn_recompute_daily_sales_aggregate(OLD.tenant_id, OLD.store_id, OLD.sold_at::DATE);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_daily_aggregate ON sales;
CREATE TRIGGER trg_sales_daily_aggregate
AFTER INSERT OR UPDATE OF total_amount, paid_amount, due_amount, status, deleted_at ON sales
FOR EACH ROW
EXECUTE FUNCTION trg_fn_sync_daily_sales_aggregate();

-- -----------------------------------------------------------------------------
-- 5. Inventory Valuation View
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_inventory_valuation AS
SELECT
    p.tenant_id,
    p.name AS product_name,
    pv.id AS variant_id,
    pv.sku,
    pv.barcode,
    COALESCE(c.name, 'Uncategorized') AS category_name,
    COALESCE(b.name, 'Generic') AS brand_name,
    COALESCE(stock.current_stock, 0) AS current_stock,
    pv.cost_price AS unit_cost_poisha,
    pv.retail_price AS unit_retail_poisha,
    (COALESCE(stock.current_stock, 0) * pv.cost_price) AS total_cost_value_poisha,
    (COALESCE(stock.current_stock, 0) * pv.retail_price) AS total_retail_value_poisha,
    ((COALESCE(stock.current_stock, 0) * pv.retail_price) - (COALESCE(stock.current_stock, 0) * pv.cost_price)) AS potential_profit_poisha,
    CASE
        WHEN pv.retail_price > 0 THEN
            ROUND((((pv.retail_price - pv.cost_price)::NUMERIC / pv.retail_price::NUMERIC) * 100), 2)
        ELSE 0
    END AS profit_margin_percentage
FROM product_variants pv
JOIN products p ON p.id = pv.product_id AND p.deleted_at IS NULL
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN brands b ON b.id = p.brand_id
LEFT JOIN (
    SELECT
        variant_id,
        tenant_id,
        SUM(quantity) AS current_stock
    FROM stock_movements
    WHERE deleted_at IS NULL
    GROUP BY variant_id, tenant_id
) stock ON stock.variant_id = pv.id AND stock.tenant_id = pv.tenant_id
WHERE pv.deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 6. Dashboard High-Speed Analytics RPC (Sub-50ms Response Time)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_dashboard_analytics(
    p_tenant_id UUID,
    p_store_id UUID DEFAULT NULL,
    p_target_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today_invoices INT := 0;
    v_today_revenue BIGINT := 0;
    v_today_cost BIGINT := 0;
    v_today_gross_profit BIGINT := 0;
    v_today_avg_basket BIGINT := 0;
    v_today_paid BIGINT := 0;
    v_today_due BIGINT := 0;

    v_yesterday_revenue BIGINT := 0;
    v_yesterday_invoices INT := 0;
    v_last_week_revenue BIGINT := 0;

    v_low_stock_count INT := 0;
    v_pending_due_customers INT := 0;
    v_total_pending_dues BIGINT := 0;

    v_hourly_sales JSONB := '[]'::JSONB;
    v_top_products JSONB := '[]'::JSONB;
BEGIN
    -- 1. Today's Core Performance
    SELECT
        COUNT(*),
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(paid_amount), 0),
        COALESCE(SUM(due_amount), 0)
    INTO
        v_today_invoices,
        v_today_revenue,
        v_today_paid,
        v_today_due
    FROM sales
    WHERE tenant_id = p_tenant_id
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND sold_at::DATE = p_target_date
      AND status = 'completed'
      AND deleted_at IS NULL;

    -- Calculate today's cost from sale items
    SELECT
        COALESCE(SUM(si.quantity * si.unit_cost), 0)
    INTO
        v_today_cost
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.tenant_id = p_tenant_id
      AND (p_store_id IS NULL OR s.store_id = p_store_id)
      AND s.sold_at::DATE = p_target_date
      AND s.status = 'completed'
      AND s.deleted_at IS NULL;

    v_today_gross_profit := v_today_revenue - v_today_cost;
    IF v_today_invoices > 0 THEN
        v_today_avg_basket := v_today_revenue / v_today_invoices;
    END IF;

    -- 2. Yesterday's Comparison
    SELECT
        COALESCE(SUM(total_revenue_poisha), 0),
        COALESCE(SUM(total_invoices), 0)
    INTO
        v_yesterday_revenue,
        v_yesterday_invoices
    FROM daily_sales_aggregates
    WHERE tenant_id = p_tenant_id
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND sale_date = (p_target_date - INTERVAL '1 day')::DATE;

    -- 3. Last Week's Same-Day Comparison (7 days ago)
    SELECT
        COALESCE(SUM(total_revenue_poisha), 0)
    INTO
        v_last_week_revenue
    FROM daily_sales_aggregates
    WHERE tenant_id = p_tenant_id
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND sale_date = (p_target_date - INTERVAL '7 days')::DATE;

    -- 4. Hourly Sales Distribution for Target Date (0 to 23 Hours)
    SELECT COALESCE(jsonb_agg(h ORDER BY h.hour), '[]'::jsonb)
    INTO v_hourly_sales
    FROM (
        SELECT
            hours.h AS hour,
            COALESCE(SUM(s.total_amount), 0) AS revenue_poisha,
            COUNT(s.id) AS invoices
        FROM generate_series(0, 23) hours(h)
        LEFT JOIN sales s
            ON s.tenant_id = p_tenant_id
           AND (p_store_id IS NULL OR s.store_id = p_store_id)
           AND s.sold_at::DATE = p_target_date
           AND EXTRACT(HOUR FROM s.sold_at) = hours.h
           AND s.status = 'completed'
           AND s.deleted_at IS NULL
        GROUP BY hours.h
    ) h;

    -- 5. Top 5 Products of the Day (by revenue & volume)
    SELECT COALESCE(jsonb_agg(top_p), '[]'::jsonb)
    INTO v_top_products
    FROM (
        SELECT
            p.name AS product_name,
            pv.sku,
            SUM(si.quantity) AS quantity_sold,
            SUM(si.subtotal) AS revenue_poisha
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN product_variants pv ON pv.id = si.variant_id
        JOIN products p ON p.id = pv.product_id
        WHERE s.tenant_id = p_tenant_id
          AND (p_store_id IS NULL OR s.store_id = p_store_id)
          AND s.sold_at::DATE = p_target_date
          AND s.status = 'completed'
          AND s.deleted_at IS NULL
        GROUP BY p.name, pv.sku
        ORDER BY revenue_poisha DESC
        LIMIT 5
    ) top_p;

    -- 6. Low-Stock Alert Count (Variants where stock <= reorder_level)
    SELECT COUNT(*)
    INTO v_low_stock_count
    FROM product_variants pv
    JOIN (
        SELECT variant_id, SUM(quantity) AS current_stock
        FROM stock_movements
        WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
        GROUP BY variant_id
    ) sm ON sm.variant_id = pv.id
    WHERE pv.tenant_id = p_tenant_id
      AND pv.deleted_at IS NULL
      AND sm.current_stock <= pv.reorder_level;

    -- 7. Outstanding Customer Dues Count & Total
    SELECT
        COUNT(*),
        COALESCE(SUM(current_due), 0)
    INTO
        v_pending_due_customers,
        v_total_pending_dues
    FROM view_customer_balances
    WHERE tenant_id = p_tenant_id
      AND current_due > 0;

    RETURN jsonb_build_object(
        'targetDate', p_target_date,
        'today', jsonb_build_object(
            'invoices', v_today_invoices,
            'revenuePoisha', v_today_revenue,
            'costPoisha', v_today_cost,
            'grossProfitPoisha', v_today_gross_profit,
            'grossMarginPercentage', CASE WHEN v_today_revenue > 0 THEN ROUND(((v_today_gross_profit::numeric / v_today_revenue::numeric) * 100), 2) ELSE 0 END,
            'averageBasketPoisha', v_today_avg_basket,
            'paidPoisha', v_today_paid,
            'duePoisha', v_today_due
        ),
        'comparison', jsonb_build_object(
            'yesterdayRevenuePoisha', v_yesterday_revenue,
            'yesterdayInvoices', v_yesterday_invoices,
            'diffYesterdayPoisha', v_today_revenue - v_yesterday_revenue,
            'pctChangeYesterday', CASE WHEN v_yesterday_revenue > 0 THEN ROUND((((v_today_revenue - v_yesterday_revenue)::numeric / v_yesterday_revenue::numeric) * 100), 2) ELSE 0 END,
            'lastWeekRevenuePoisha', v_last_week_revenue,
            'diffLastWeekPoisha', v_today_revenue - v_last_week_revenue,
            'pctChangeLastWeek', CASE WHEN v_last_week_revenue > 0 THEN ROUND((((v_today_revenue - v_last_week_revenue)::numeric / v_last_week_revenue::numeric) * 100), 2) ELSE 0 END
        ),
        'hourlySales', v_hourly_sales,
        'topProducts', v_top_products,
        'lowStockCount', v_low_stock_count,
        'dues', jsonb_build_object(
            'pendingCustomers', v_pending_due_customers,
            'totalDuePoisha', v_total_pending_dues
        )
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Dead Stock Detection RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_dead_stock(
    p_tenant_id UUID,
    p_store_id UUID DEFAULT NULL,
    p_days_threshold INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB := '[]'::JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(ds), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT
            p.name AS product_name,
            pv.id AS variant_id,
            pv.sku,
            pv.barcode,
            COALESCE(c.name, 'Uncategorized') AS category_name,
            sm.current_stock,
            pv.cost_price AS unit_cost_poisha,
            (sm.current_stock * pv.cost_price) AS dead_stock_value_poisha,
            last_sale.last_sold_at,
            CASE
                WHEN last_sale.last_sold_at IS NULL THEN 9999
                ELSE (CURRENT_DATE - last_sale.last_sold_at::DATE)
            END AS days_without_sales
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id AND p.deleted_at IS NULL
        LEFT JOIN categories c ON c.id = p.category_id
        JOIN (
            SELECT variant_id, SUM(quantity) AS current_stock
            FROM stock_movements
            WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
            GROUP BY variant_id
            HAVING SUM(quantity) > 0
        ) sm ON sm.variant_id = pv.id
        LEFT JOIN (
            SELECT
                si.variant_id,
                MAX(s.sold_at) AS last_sold_at
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            WHERE s.tenant_id = p_tenant_id
              AND s.status = 'completed'
              AND s.deleted_at IS NULL
            GROUP BY si.variant_id
        ) last_sale ON last_sale.variant_id = pv.id
        WHERE pv.tenant_id = p_tenant_id
          AND pv.deleted_at IS NULL
          AND (last_sale.last_sold_at IS NULL OR last_sale.last_sold_at < (now() - (p_days_threshold || ' days')::INTERVAL))
        ORDER BY dead_stock_value_poisha DESC
    ) ds;

    RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Customer Dues Aging Analysis RPC (0-30, 31-60, 61-90, 90+ days)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_customer_aging(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_poisha BIGINT := 0;      -- 0-30 days
    v_days_31_60_poisha BIGINT := 0;   -- 31-60 days
    v_days_61_90_poisha BIGINT := 0;   -- 61-90 days
    v_days_90_plus_poisha BIGINT := 0; -- 90+ days
    v_total_due_poisha BIGINT := 0;
    v_customer_breakdown JSONB := '[]'::JSONB;
BEGIN
    -- Customer Aging Summary Buckets based on unpaid invoices
    SELECT
        COALESCE(SUM(CASE WHEN CURRENT_DATE - s.sold_at::DATE <= 30 THEN s.due_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN CURRENT_DATE - s.sold_at::DATE BETWEEN 31 AND 60 THEN s.due_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN CURRENT_DATE - s.sold_at::DATE BETWEEN 61 AND 90 THEN s.due_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN CURRENT_DATE - s.sold_at::DATE > 90 THEN s.due_amount ELSE 0 END), 0),
        COALESCE(SUM(s.due_amount), 0)
    INTO
        v_current_poisha,
        v_days_31_60_poisha,
        v_days_61_90_poisha,
        v_days_90_plus_poisha,
        v_total_due_poisha
    FROM sales s
    WHERE s.tenant_id = p_tenant_id
      AND s.due_amount > 0
      AND s.status = 'completed'
      AND s.deleted_at IS NULL;

    -- Per-Customer Aging Breakdown (Top 20 Debtors)
    SELECT COALESCE(jsonb_agg(c_aging), '[]'::jsonb)
    INTO v_customer_breakdown
    FROM (
        SELECT
            c.id AS customer_id,
            c.name AS customer_name,
            c.phone,
            COALESCE(cb.current_due, 0) AS total_balance_poisha,
            COALESCE(SUM(CASE WHEN CURRENT_DATE - s.sold_at::DATE <= 30 THEN s.due_amount ELSE 0 END), 0) AS bucket_0_30,
            COALESCE(SUM(CASE WHEN CURRENT_DATE - s.sold_at::DATE BETWEEN 31 AND 60 THEN s.due_amount ELSE 0 END), 0) AS bucket_31_60,
            COALESCE(SUM(CASE WHEN CURRENT_DATE - s.sold_at::DATE BETWEEN 61 AND 90 THEN s.due_amount ELSE 0 END), 0) AS bucket_61_90,
            COALESCE(SUM(CASE WHEN CURRENT_DATE - s.sold_at::DATE > 90 THEN s.due_amount ELSE 0 END), 0) AS bucket_90_plus
        FROM customers c
        JOIN sales s ON s.customer_id = c.id
        LEFT JOIN view_customer_balances cb ON cb.customer_id = c.id
        WHERE c.tenant_id = p_tenant_id
          AND s.due_amount > 0
          AND s.status = 'completed'
          AND s.deleted_at IS NULL
        GROUP BY c.id, c.name, c.phone, cb.current_due
        ORDER BY total_balance_poisha DESC
        LIMIT 20
    ) c_aging;

    RETURN jsonb_build_object(
        'totalDuePoisha', v_total_due_poisha,
        'agingBuckets', jsonb_build_object(
            'current0To30Poisha', v_current_poisha,
            'days31To60Poisha', v_days_31_60_poisha,
            'days61To90Poisha', v_days_61_90_poisha,
            'days90PlusPoisha', v_days_90_plus_poisha
        ),
        'topDebtors', v_customer_breakdown
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. Cash Drawer Shift Management RPCs
-- -----------------------------------------------------------------------------

-- Open Cash Drawer Shift
CREATE OR REPLACE FUNCTION fn_open_cash_drawer(
    p_tenant_id UUID,
    p_store_id UUID,
    p_cashier_id UUID,
    p_opening_float_poisha BIGINT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id UUID;
    v_existing_id UUID;
BEGIN
    -- Check if cashier already has an open session
    SELECT id INTO v_existing_id
    FROM cash_drawer_sessions
    WHERE tenant_id = p_tenant_id
      AND store_id = p_store_id
      AND cashier_id = p_cashier_id
      AND status = 'open'
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'isExisting', true,
            'sessionId', v_existing_id,
            'message', 'Reconnected to currently open cash drawer session'
        );
    END IF;

    INSERT INTO cash_drawer_sessions (
        tenant_id,
        store_id,
        cashier_id,
        opening_float_poisha,
        status,
        notes
    )
    VALUES (
        p_tenant_id,
        p_store_id,
        p_cashier_id,
        p_opening_float_poisha,
        'open',
        p_notes
    )
    RETURNING id INTO v_session_id;

    -- Audit log
    INSERT INTO audit_logs (
        tenant_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        new_values
    )
    VALUES (
        p_tenant_id,
        p_cashier_id,
        'shift.opened',
        'cash_drawer_sessions',
        v_session_id::TEXT,
        jsonb_build_object('opening_float', p_opening_float_poisha, 'store_id', p_store_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'isExisting', false,
        'sessionId', v_session_id,
        'message', 'Cash drawer shift opened successfully'
    );
END;
$$;

-- Add Cash In / Cash Out drawer entry
CREATE OR REPLACE FUNCTION fn_add_cash_drawer_tx(
    p_tenant_id UUID,
    p_session_id UUID,
    p_type VARCHAR,
    p_amount_poisha BIGINT,
    p_reason TEXT,
    p_performed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tx_id UUID;
BEGIN
    INSERT INTO cash_drawer_transactions (
        session_id,
        tenant_id,
        type,
        amount_poisha,
        reason,
        performed_by
    )
    VALUES (
        p_session_id,
        p_tenant_id,
        p_type,
        p_amount_poisha,
        p_reason,
        p_performed_by
    )
    RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'txId', v_tx_id,
        'type', p_type,
        'amountPoisha', p_amount_poisha
    );
END;
$$;

-- Close Cash Drawer Shift (Calculates Expected Cash & Variance)
CREATE OR REPLACE FUNCTION fn_close_cash_drawer(
    p_tenant_id UUID,
    p_session_id UUID,
    p_counted_cash_poisha BIGINT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session cash_drawer_sessions%ROWTYPE;
    v_cash_sales BIGINT := 0;
    v_cash_dues_collected BIGINT := 0;
    v_cash_ins BIGINT := 0;
    v_cash_outs BIGINT := 0;
    v_cash_refunds BIGINT := 0;
    v_expected_cash BIGINT := 0;
    v_variance BIGINT := 0;
    v_closing_time TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_session
    FROM cash_drawer_sessions
    WHERE id = p_session_id AND tenant_id = p_tenant_id;

    IF v_session.id IS NULL THEN
        RAISE EXCEPTION 'Cash drawer session not found';
    END IF;

    IF v_session.status = 'closed' THEN
        RAISE EXCEPTION 'Cash drawer session is already closed';
    END IF;

    -- 1. Total cash collected from sales during shift
    SELECT COALESCE(SUM(sp.amount), 0)
    INTO v_cash_sales
    FROM sale_payments sp
    JOIN sales s ON s.id = sp.sale_id
    WHERE s.tenant_id = p_tenant_id
      AND s.store_id = v_session.store_id
      AND s.cashier_id = v_session.cashier_id
      AND sp.method = 'cash'
      AND s.sold_at >= v_session.opened_at
      AND s.sold_at <= v_closing_time
      AND s.status = 'completed'
      AND s.deleted_at IS NULL;

    -- 2. Total cash collected from customer dues payments during shift
    SELECT COALESCE(SUM(amount), 0)
    INTO v_cash_dues_collected
    FROM customer_payments
    WHERE tenant_id = p_tenant_id
      AND payment_method = 'cash'
      AND created_by = v_session.cashier_id
      AND paid_at >= v_session.opened_at
      AND paid_at <= v_closing_time;

    -- 3. Total cash refunded during shift
    SELECT COALESCE(SUM(refund_amount), 0)
    INTO v_cash_refunds
    FROM returns
    WHERE tenant_id = p_tenant_id
      AND store_id = v_session.store_id
      AND refund_method = 'cash'
      AND created_by = v_session.cashier_id
      AND created_at >= v_session.opened_at
      AND created_at <= v_closing_time
      AND deleted_at IS NULL;

    -- 4. Manual Cash In / Cash Out adjustments during shift
    SELECT
        COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount_poisha ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount_poisha ELSE 0 END), 0)
    INTO
        v_cash_ins,
        v_cash_outs
    FROM cash_drawer_transactions
    WHERE session_id = p_session_id;

    -- Expected Cash Formula:
    -- Opening Float + Cash Sales + Dues Collections + Cash In - Cash Out - Cash Refunds
    v_expected_cash := v_session.opening_float_poisha + v_cash_sales + v_cash_dues_collected + v_cash_ins - v_cash_outs - v_cash_refunds;
    v_variance := p_counted_cash_poisha - v_expected_cash;

    -- Update and close session
    UPDATE cash_drawer_sessions
    SET status = 'closed',
        closed_at = v_closing_time,
        closing_counted_poisha = p_counted_cash_poisha,
        expected_cash_poisha = v_expected_cash,
        cash_variance_poisha = v_variance,
        notes = COALESCE(p_notes, notes),
        updated_at = v_closing_time
    WHERE id = p_session_id;

    -- If significant variance (e.g. over ৳100 or 10,000 poisha), write a notification alert
    IF ABS(v_variance) >= 10000 THEN
        INSERT INTO notifications (
            tenant_id,
            type,
            title,
            message,
            data
        )
        VALUES (
            p_tenant_id,
            'shift_variance',
            'Cash Drawer Discrepancy Alert',
            'Cash drawer shift closed with variance of ৳' || (v_variance / 100)::TEXT || '.',
            jsonb_build_object(
                'sessionId', p_session_id,
                'cashierId', v_session.cashier_id,
                'expected', v_expected_cash,
                'counted', p_counted_cash_poisha,
                'variance', v_variance
            )
        );
    END IF;

    -- Audit log
    INSERT INTO audit_logs (
        tenant_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        new_values
    )
    VALUES (
        p_tenant_id,
        v_session.cashier_id,
        'shift.closed',
        'cash_drawer_sessions',
        p_session_id::TEXT,
        jsonb_build_object(
            'opening_float', v_session.opening_float_poisha,
            'expected_cash', v_expected_cash,
            'counted_cash', p_counted_cash_poisha,
            'variance', v_variance
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'sessionId', p_session_id,
        'openedAt', v_session.opened_at,
        'closedAt', v_closing_time,
        'openingFloatPoisha', v_session.opening_float_poisha,
        'cashSalesPoisha', v_cash_sales,
        'cashDuesCollectedPoisha', v_cash_dues_collected,
        'cashInsPoisha', v_cash_ins,
        'cashOutsPoisha', v_cash_outs,
        'cashRefundsPoisha', v_cash_refunds,
        'expectedCashPoisha', v_expected_cash,
        'countedCashPoisha', p_counted_cash_poisha,
        'variancePoisha', v_variance
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. Row Level Security Policies
-- -----------------------------------------------------------------------------
ALTER TABLE cash_drawer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_drawer_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_drawer_sessions_tenant ON cash_drawer_sessions
FOR ALL
USING (is_tenant_member(tenant_id))
WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY cash_drawer_tx_tenant ON cash_drawer_transactions
FOR ALL
USING (is_tenant_member(tenant_id))
WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY daily_sales_aggregates_tenant ON daily_sales_aggregates
FOR SELECT
USING (is_tenant_member(tenant_id) AND has_role(tenant_id, ARRAY['owner'::user_role, 'manager'::user_role]));

CREATE POLICY notifications_tenant ON notifications
FOR ALL
USING (is_tenant_member(tenant_id))
WITH CHECK (is_tenant_member(tenant_id));
