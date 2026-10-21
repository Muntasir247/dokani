import { describe, it, expect } from "vitest";
import {
  calculateLinePricing,
  calculateCartTotals,
  calculatePaymentBreakdown,
  verifyAndRecomputePayload,
} from "@/lib/pos/pricing";
import {
  createSaleSchema,
  returnSaleSchema,
  voidSaleSchema,
} from "@/lib/validation/pos";
import { can } from "@/lib/auth/permissions";

describe("End-to-End POS Transaction & Sale Flow Invariants", () => {
  const dummyTenantId = "11111111-1111-1111-1111-111111111111";
  const dummyStoreId = "22222222-2222-2222-2222-222222222222";
  const dummyLocationId = "33333333-3333-3333-3333-333333333333";
  const dummyCustomerId = "44444444-4444-4444-4444-444444444444";
  const dummyVariantId = "55555555-5555-5555-5555-555555555555";
  const dummySaleId = "66666666-6666-6666-6666-666666666666";
  const dummySaleItemId = "77777777-7777-7777-7777-777777777777";

  it("validates valid POS sale checkout payload via Zod schema", () => {
    const payload = {
      tenant_id: dummyTenantId,
      store_id: dummyStoreId,
      location_id: dummyLocationId,
      customer_id: dummyCustomerId,
      items: [
        {
          variant_id: dummyVariantId,
          quantity: 2,
          discount_type: "percent",
          discount_value: 5,
          serials: ["SN-A101", "SN-A102"],
        },
      ],
      cart_discount_type: "fixed",
      cart_discount_value: 1000, // 10 BDT
      payments: [
        { method: "cash", amount: 150000 },
        { method: "bkash", amount: 50000, reference: "TRX987654321" },
      ],
      client_reported_total: 200000,
    };

    const parseResult = createSaleSchema.safeParse(payload);
    expect(parseResult.success).toBe(true);
  });

  it("rejects sale creation when cart is empty", () => {
    const payload = {
      tenant_id: dummyTenantId,
      store_id: dummyStoreId,
      location_id: dummyLocationId,
      items: [], // empty cart
      payments: [],
    };

    const parseResult = createSaleSchema.safeParse(payload);
    expect(parseResult.success).toBe(false);
  });

  it("rejects invalid UUIDs or negative quantities in sale items", () => {
    const payload = {
      tenant_id: dummyTenantId,
      store_id: dummyStoreId,
      location_id: dummyLocationId,
      items: [
        {
          variant_id: "not-a-uuid",
          quantity: -1,
        },
      ],
      payments: [],
    };

    const parseResult = createSaleSchema.safeParse(payload);
    expect(parseResult.success).toBe(false);
  });

  it("validates return sale schema with optional restock", () => {
    const returnPayload = {
      tenant_id: dummyTenantId,
      sale_id: dummySaleId,
      store_id: dummyStoreId,
      location_id: dummyLocationId,
      items: [
        {
          sale_item_id: dummySaleItemId,
          variant_id: dummyVariantId,
          quantity: 1,
          refund_unit_price: 15000,
          restock: true,
          serials: ["SN-A101"],
        },
      ],
      refund_method: "cash",
      reason: "Defective port, customer exchanged for new model",
    };

    const parseResult = returnSaleSchema.safeParse(returnPayload);
    expect(parseResult.success).toBe(true);
  });

  it("validates void sale schema and enforces manager/owner permission", () => {
    const voidPayload = {
      tenant_id: dummyTenantId,
      sale_id: dummySaleId,
      reason: "Accidental scan of wrong item during cash test",
    };

    const parseResult = voidSaleSchema.safeParse(voidPayload);
    expect(parseResult.success).toBe(true);

    // Permission checks
    expect(can("cashier", "void:sale")).toBe(false); // Cashier CANNOT void
    expect(can("manager", "void:sale")).toBe(true); // Manager CAN void
    expect(can("owner", "void:sale")).toBe(true); // Owner CAN void
  });

  it("recomputes tampered prices: server replaces hacked 1 BDT with authoritative 500 BDT", () => {
    const serverVariant = {
      variantId: dummyVariantId,
      retailPricePoisha: 50000, // 500.00 BDT in database
      taxRateBasisPoints: 500, // 5% VAT
      quantity: 2,
    };

    // Client hacked payload claims total is 200 poisha (2 BDT)!
    const verification = verifyAndRecomputePayload({
      serverItems: [serverVariant],
      clientReportedTotalPoisha: 200,
      role: "cashier",
    });

    expect(verification.isTampered).toBe(true);
    // Real calculation: 2 * 500 BDT = 1,000 BDT subtotal + 5% VAT (50 BDT) = 1,050 BDT (105,000 poisha)
    expect(verification.authoritativeCartTotals.subtotalPoisha).toBe(100000);
    expect(verification.authoritativeCartTotals.totalTaxPoisha).toBe(5000);
    expect(verification.authoritativeCartTotals.totalAmountPoisha).toBe(105000);
  });
});
