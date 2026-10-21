-- =============================================================================
-- Seed Script: supabase/seed.sql
-- Description: Deterministic test data for Dokani POS SaaS
-- Sets up 2 distinct tenants, stores, locations, categories, brands, products,
-- variants, serials, purchases, sales, payments, and immutable stock movements.
-- =============================================================================

-- Deterministic UUIDs for Tenant 1 (Dhaka Gadget Hub)
DO $$
DECLARE
    -- Tenant 1: Dhaka Gadget Hub (Electronics / Gadgets)
    t1_id UUID := '11111111-1111-1111-1111-111111111111';
    t1_owner_id UUID := 'a1111111-1111-1111-1111-111111111111';
    t1_cashier_id UUID := 'a2222222-2222-2222-2222-222222222222';
    t1_store_id UUID := '11111111-2222-1111-1111-111111111111';
    t1_loc_floor UUID := '11111111-3333-1111-1111-111111111111';
    t1_loc_warehouse UUID := '11111111-3333-2222-1111-111111111111';
    t1_cat_chargers UUID := '11111111-4444-1111-1111-111111111111';
    t1_cat_audio UUID := '11111111-4444-2222-1111-111111111111';
    t1_brand_anker UUID := '11111111-5555-1111-1111-111111111111';
    t1_brand_baseus UUID := '11111111-5555-2222-1111-111111111111';
    t1_prod_anker UUID := '11111111-6666-1111-1111-111111111111';
    t1_prod_earbuds UUID := '11111111-6666-2222-1111-111111111111';
    t1_var_anker_wht UUID := '11111111-7777-1111-1111-111111111111';
    t1_var_anker_blk UUID := '11111111-7777-2222-1111-111111111111';
    t1_var_earbuds UUID := '11111111-7777-3333-1111-111111111111';
    t1_supplier_id UUID := '11111111-8888-1111-1111-111111111111';
    t1_cust_sabbir UUID := '11111111-9999-1111-1111-111111111111';
    t1_cust_rahim UUID := '11111111-9999-2222-1111-111111111111';
    t1_purchase_id UUID := '11111111-aaaa-1111-1111-111111111111';
    t1_sale1_id UUID := '11111111-bbbb-1111-1111-111111111111';
    t1_sale2_id UUID := '11111111-bbbb-2222-1111-111111111111';

    -- Tenant 2: Bismillah Fashion (Apparel / Fashion)
    t2_id UUID := '22222222-2222-2222-2222-222222222222';
    t2_owner_id UUID := 'b1111111-1111-1111-1111-111111111111';
    t2_store_id UUID := '22222222-2222-1111-1111-111111111111';
    t2_loc_floor UUID := '22222222-3333-1111-1111-111111111111';
    t2_cat_panjabi UUID := '22222222-4444-1111-1111-111111111111';
    t2_brand_lubnan UUID := '22222222-5555-1111-1111-111111111111';
    t2_prod_panjabi UUID := '22222222-6666-1111-1111-111111111111';
    t2_var_panjabi_40 UUID := '22222222-7777-1111-1111-111111111111';
    t2_var_panjabi_42 UUID := '22222222-7777-2222-1111-111111111111';
    t2_cust_karim UUID := '22222222-9999-1111-1111-111111111111';
    t2_purchase_id UUID := '22222222-aaaa-1111-1111-111111111111';
    t2_sale_id UUID := '22222222-bbbb-1111-1111-111111111111';
BEGIN
    -- -------------------------------------------------------------------------
    -- TENANT 1: Dhaka Gadget Hub
    -- -------------------------------------------------------------------------
    INSERT INTO tenants (id, name, slug, currency, timezone)
    VALUES (t1_id, 'Dhaka Gadget Hub', 'dhaka-gadget-hub', 'BDT', 'Asia/Dhaka')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO profiles (id, email, full_name, phone)
    VALUES
        (t1_owner_id, 'arif@dhakagadget.com', 'Arif Hossain', '01711112233'),
        (t1_cashier_id, 'tanvir@dhakagadget.com', 'Tanvir Ahmed', '01822223344')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO tenant_members (tenant_id, user_id, role, is_active)
    VALUES
        (t1_id, t1_owner_id, 'owner', true),
        (t1_id, t1_cashier_id, 'cashier', true)
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    INSERT INTO subscriptions (tenant_id, plan_tier, status, max_stores, max_products, max_staff)
    VALUES (t1_id, 'pro', 'active', 3, 1000, 5)
    ON CONFLICT DO NOTHING;

    INSERT INTO stores (id, tenant_id, name, code, address, phone, is_main)
    VALUES (t1_store_id, t1_id, 'Elephant Road Branch', 'DGH-01', 'Shop 42, Multiplan Center, Dhaka', '01711112233', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO stock_locations (id, tenant_id, store_id, name, is_default)
    VALUES
        (t1_loc_floor, t1_id, t1_store_id, 'Ground Floor Display', true),
        (t1_loc_warehouse, t1_id, t1_store_id, 'Level 4 Stockroom', false)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO categories (id, tenant_id, name, slug)
    VALUES
        (t1_cat_chargers, t1_id, 'Chargers & Cables', 'chargers-cables'),
        (t1_cat_audio, t1_id, 'Earphones & Audio', 'earphones-audio')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO brands (id, tenant_id, name)
    VALUES
        (t1_brand_anker, t1_id, 'Anker'),
        (t1_brand_baseus, t1_id, 'Baseus')
    ON CONFLICT (id) DO NOTHING;

    -- Products
    INSERT INTO products (id, tenant_id, category_id, brand_id, name, description, has_variants, has_serials, unit)
    VALUES
        (t1_prod_anker, t1_id, t1_cat_chargers, t1_brand_anker, 'Anker 20W PowerPort III Nano', 'Ultra-compact USB-C Fast Charger', true, false, 'pcs'),
        (t1_prod_earbuds, t1_id, t1_cat_audio, t1_brand_baseus, 'Baseus Bowie M2+ ANC Wireless Earbuds', 'Active Noise Cancelling Bluetooth Earbuds', false, true, 'pcs')
    ON CONFLICT (id) DO NOTHING;

    -- Variants (cost and prices stored in poisha: 1 BDT = 100 poisha)
    INSERT INTO product_variants (id, tenant_id, product_id, name, sku, barcode, cost_price, retail_price, wholesale_price, tax_rate, reorder_point)
    VALUES
        (t1_var_anker_wht, t1_id, t1_prod_anker, 'White', 'ANK-NANO-WHT', '848061001011', 120000, 165000, 145000, 5.00, 10),
        (t1_var_anker_blk, t1_id, t1_prod_anker, 'Black', 'ANK-NANO-BLK', '848061001028', 120000, 165000, 145000, 5.00, 10),
        (t1_var_earbuds, t1_id, t1_prod_earbuds, 'Standard Black', 'BAS-M2P-BLK', '6932172605513', 280000, 385000, 340000, 5.00, 5)
    ON CONFLICT (id) DO NOTHING;

    -- Serials for Earbuds
    INSERT INTO product_serials (tenant_id, variant_id, stock_location_id, serial_number, status)
    VALUES
        (t1_id, t1_var_earbuds, t1_loc_floor, 'BS-SN-0001', 'sold'),
        (t1_id, t1_var_earbuds, t1_loc_floor, 'BS-SN-0002', 'available'),
        (t1_id, t1_var_earbuds, t1_loc_floor, 'BS-SN-0003', 'available')
    ON CONFLICT DO NOTHING;

    -- Contacts
    INSERT INTO suppliers (id, tenant_id, name, company, phone)
    VALUES (t1_supplier_id, t1_id, 'Star Tech Wholesale', 'Star Tech & Engineering Ltd', '01711000001')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO customers (id, tenant_id, name, phone, credit_limit, opening_balance)
    VALUES
        (t1_cust_sabbir, t1_id, 'Sabbir Rahman', '01819000001', 1000000, 0),
        (t1_cust_rahim, t1_id, 'Rahim Uddin', '01912000002', 500000, 0)
    ON CONFLICT (id) DO NOTHING;

    -- Purchase 1: Inbound stock from Star Tech
    INSERT INTO purchases (id, tenant_id, store_id, supplier_id, invoice_number, total_cost, paid_amount)
    VALUES (t1_purchase_id, t1_id, t1_store_id, t1_supplier_id, 'PUR-2026-001', 13600000, 13600000)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO purchase_items (tenant_id, purchase_id, variant_id, quantity, unit_cost, subtotal)
    VALUES
        (t1_id, t1_purchase_id, t1_var_anker_wht, 50, 120000, 6000000),
        (t1_id, t1_purchase_id, t1_var_anker_blk, 40, 120000, 4800000),
        (t1_id, t1_purchase_id, t1_var_earbuds, 10, 280000, 2800000)
    ON CONFLICT DO NOTHING;

    -- Inventory Ledger for Purchase 1
    INSERT INTO stock_movements (tenant_id, location_id, variant_id, type, quantity, unit_cost, reference_id, reference_type, notes)
    VALUES
        (t1_id, t1_loc_floor, t1_var_anker_wht, 'purchase', 50, 120000, t1_purchase_id, 'purchase', 'Stock from PUR-2026-001'),
        (t1_id, t1_loc_floor, t1_var_anker_blk, 'purchase', 40, 120000, t1_purchase_id, 'purchase', 'Stock from PUR-2026-001'),
        (t1_id, t1_loc_floor, t1_var_earbuds, 'purchase', 10, 280000, t1_purchase_id, 'purchase', 'Stock from PUR-2026-001')
    ON CONFLICT DO NOTHING;

    -- Sale 1: 2 x Anker White to Sabbir Rahman via bKash
    INSERT INTO sales (id, tenant_id, store_id, customer_id, cashier_id, invoice_number, subtotal, discount_amount, tax_amount, total_amount, paid_amount, due_amount)
    VALUES (t1_sale1_id, t1_id, t1_store_id, t1_cust_sabbir, t1_cashier_id, 'INV-2026-0001', 330000, 0, 0, 330000, 330000, 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO sale_items (tenant_id, sale_id, variant_id, quantity, unit_price, unit_cost, subtotal)
    VALUES (t1_id, t1_sale1_id, t1_var_anker_wht, 2, 165000, 120000, 330000)
    ON CONFLICT DO NOTHING;

    INSERT INTO sale_payments (tenant_id, sale_id, method, amount, reference)
    VALUES (t1_id, t1_sale1_id, 'bkash', 330000, 'TRX9876543210')
    ON CONFLICT DO NOTHING;

    -- Inventory Ledger for Sale 1 (-2 quantity)
    INSERT INTO stock_movements (tenant_id, location_id, variant_id, type, quantity, unit_cost, reference_id, reference_type, notes)
    VALUES (t1_id, t1_loc_floor, t1_var_anker_wht, 'sale', -2, 120000, t1_sale1_id, 'sale', 'POS Sale INV-2026-0001')
    ON CONFLICT DO NOTHING;

    -- Sale 2: 1 x Baseus Earbud to Rahim Uddin (Partial cash, partial due)
    INSERT INTO sales (id, tenant_id, store_id, customer_id, cashier_id, invoice_number, subtotal, discount_amount, tax_amount, total_amount, paid_amount, due_amount)
    VALUES (t1_sale2_id, t1_id, t1_store_id, t1_cust_rahim, t1_cashier_id, 'INV-2026-0002', 385000, 0, 0, 385000, 300000, 85000)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO sale_items (tenant_id, sale_id, variant_id, quantity, unit_price, unit_cost, subtotal, serial_numbers)
    VALUES (t1_id, t1_sale2_id, t1_var_earbuds, 1, 385000, 280000, 385000, ARRAY['BS-SN-0001'])
    ON CONFLICT DO NOTHING;

    INSERT INTO sale_payments (tenant_id, sale_id, method, amount, reference)
    VALUES
        (t1_id, t1_sale2_id, 'cash', 300000, 'Cash received at till'),
        (t1_id, t1_sale2_id, 'due', 85000, 'Customer due ledger')
    ON CONFLICT DO NOTHING;

    -- Inventory Ledger for Sale 2 (-1 quantity)
    INSERT INTO stock_movements (tenant_id, location_id, variant_id, type, quantity, unit_cost, reference_id, reference_type, notes)
    VALUES (t1_id, t1_loc_floor, t1_var_earbuds, 'sale', -1, 280000, t1_sale2_id, 'sale', 'POS Sale INV-2026-0002')
    ON CONFLICT DO NOTHING;


    -- -------------------------------------------------------------------------
    -- TENANT 2: Bismillah Fashion
    -- -------------------------------------------------------------------------
    INSERT INTO tenants (id, name, slug, currency, timezone)
    VALUES (t2_id, 'Bismillah Fashion', 'bismillah-fashion', 'BDT', 'Asia/Dhaka')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO profiles (id, email, full_name, phone)
    VALUES (t2_owner_id, 'farhana@bismillahfashion.com', 'Farhana Akter', '01933334455')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO tenant_members (tenant_id, user_id, role, is_active)
    VALUES (t2_id, t2_owner_id, 'owner', true)
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    INSERT INTO subscriptions (tenant_id, plan_tier, status, max_stores, max_products, max_staff)
    VALUES (t2_id, 'free', 'active', 1, 200, 2)
    ON CONFLICT DO NOTHING;

    INSERT INTO stores (id, tenant_id, name, code, address, is_main)
    VALUES (t2_store_id, t2_id, 'Dhanmondi Outlet', 'BF-01', 'Rangs Fortune Square, Dhanmondi, Dhaka', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO stock_locations (id, tenant_id, store_id, name, is_default)
    VALUES (t2_loc_floor, t2_id, t2_store_id, 'Main Display Floor', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO categories (id, tenant_id, name, slug)
    VALUES (t2_cat_panjabi, t2_id, 'Panjabi & Traditional', 'panjabi-traditional')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO brands (id, tenant_id, name)
    VALUES (t2_brand_lubnan, t2_id, 'Lubnan')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO products (id, tenant_id, category_id, brand_id, name, description, has_variants, unit)
    VALUES (t2_prod_panjabi, t2_id, t2_cat_panjabi, t2_brand_lubnan, 'Lubnan Classic Cotton Panjabi', '100% fine cotton embroidered Panjabi', true, 'pcs')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO product_variants (id, tenant_id, product_id, name, sku, barcode, cost_price, retail_price, reorder_point)
    VALUES
        (t2_var_panjabi_40, t2_id, t2_prod_panjabi, 'White / Size 40', 'LUB-PAN-W40', '894100100101', 180000, 280000, 5),
        (t2_var_panjabi_42, t2_id, t2_prod_panjabi, 'White / Size 42', 'LUB-PAN-W42', '894100100102', 180000, 280000, 5)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO customers (id, tenant_id, name, phone)
    VALUES (t2_cust_karim, t2_id, 'Karim Sheikh', '01712998877')
    ON CONFLICT (id) DO NOTHING;

    -- Inbound purchase for Tenant 2
    INSERT INTO purchases (id, tenant_id, store_id, invoice_number, total_cost, paid_amount)
    VALUES (t2_purchase_id, t2_id, t2_store_id, 'BF-PUR-001', 8100000, 8100000)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO purchase_items (tenant_id, purchase_id, variant_id, quantity, unit_cost, subtotal)
    VALUES
        (t2_id, t2_purchase_id, t2_var_panjabi_40, 20, 180000, 3600000),
        (t2_id, t2_purchase_id, t2_var_panjabi_42, 25, 180000, 4500000)
    ON CONFLICT DO NOTHING;

    INSERT INTO stock_movements (tenant_id, location_id, variant_id, type, quantity, unit_cost, reference_id, reference_type)
    VALUES
        (t2_id, t2_loc_floor, t2_var_panjabi_40, 'purchase', 20, 180000, t2_purchase_id, 'purchase'),
        (t2_id, t2_loc_floor, t2_var_panjabi_42, 'purchase', 25, 180000, t2_purchase_id, 'purchase')
    ON CONFLICT DO NOTHING;

    -- Sale for Tenant 2: 1 x Panjabi 40
    INSERT INTO sales (id, tenant_id, store_id, customer_id, cashier_id, invoice_number, subtotal, total_amount, paid_amount)
    VALUES (t2_sale_id, t2_id, t2_store_id, t2_cust_karim, t2_owner_id, 'BF-INV-001', 280000, 280000, 280000)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO sale_items (tenant_id, sale_id, variant_id, quantity, unit_price, unit_cost, subtotal)
    VALUES (t2_id, t2_sale_id, t2_var_panjabi_40, 1, 280000, 180000, 280000)
    ON CONFLICT DO NOTHING;

    INSERT INTO sale_payments (tenant_id, sale_id, method, amount)
    VALUES (t2_id, t2_sale_id, 'cash', 280000)
    ON CONFLICT DO NOTHING;

    -- Stock deduction for Tenant 2 (-1 quantity)
    INSERT INTO stock_movements (tenant_id, location_id, variant_id, type, quantity, unit_cost, reference_id, reference_type)
    VALUES (t2_id, t2_loc_floor, t2_var_panjabi_40, 'sale', -1, 180000, t2_sale_id, 'sale')
    ON CONFLICT DO NOTHING;

END $$;
