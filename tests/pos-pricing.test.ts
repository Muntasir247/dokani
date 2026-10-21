import { describe, it, expect } from "vitest";
import {
  calculateLinePricing,
  calculateCartTotals,
  calculatePaymentBreakdown,
  verifyAndRecomputePayload,
} from "@/lib/pos/pricing";

describe("POS Pricing, Discount Caps & Rounding Engine", () => {
  it("calculates exact line item subtotal without discount", () => {
    // 3 items @ 150.00 BDT (15000 poisha), tax 5% (500 bps)
    const line = calculateLinePricing({
      unitPricePoisha: 15000,
      quantity: 3,
      discountType: "none",
      taxRateBasisPoints: 500,
    });

    expect(line.rawSubtotalPoisha).toBe(45000); // 450.00 BDT
    expect(line.discountAmountPoisha).toBe(0);
    expect(line.taxableAmountPoisha).toBe(45000);
    expect(line.taxAmountPoisha).toBe(2250); // 45000 * 500 / 10000 = 22.50 BDT
    expect(line.finalSubtotalPoisha).toBe(47250); // 472.50 BDT
  });

  it("applies percentage discount with integer poisha rounding", () => {
    // 1 item @ 199.99 BDT (19999 poisha), 15% discount
    const line = calculateLinePricing({
      unitPricePoisha: 19999,
      quantity: 1,
      discountType: "percent",
      discountValue: 15,
      taxRateBasisPoints: 0,
      role: "manager", // Manager can give 15%
    });

    // 19999 * 0.15 = 2999.85 -> rounded to 3000 poisha
    expect(line.discountAmountPoisha).toBe(3000);
    expect(line.taxableAmountPoisha).toBe(16999);
    expect(line.finalSubtotalPoisha).toBe(16999);
  });

  it("enforces role-based discount cap (cashier capped at 10% max)", () => {
    // Cashier attempts to give 25% discount
    const cashierLine = calculateLinePricing({
      unitPricePoisha: 10000, // 100 BDT
      quantity: 1,
      discountType: "percent",
      discountValue: 25,
      role: "cashier",
      maxCashierDiscountPercent: 10,
    });

    // Automatically capped to 10% = 1000 poisha
    expect(cashierLine.discountAmountPoisha).toBe(1000);
    expect(cashierLine.taxableAmountPoisha).toBe(9000);

    // Manager giving same 25% gets full 25%
    const managerLine = calculateLinePricing({
      unitPricePoisha: 10000,
      quantity: 1,
      discountType: "percent",
      discountValue: 25,
      role: "manager",
    });

    expect(managerLine.discountAmountPoisha).toBe(2500);
  });

  it("caps fixed discount so it never exceeds line subtotal", () => {
    const line = calculateLinePricing({
      unitPricePoisha: 5000, // 50 BDT
      quantity: 1,
      discountType: "fixed",
      discountValue: 10000, // 100 BDT discount requested!
    });

    // Capped at 5000 poisha (subtotal)
    expect(line.discountAmountPoisha).toBe(5000);
    expect(line.taxableAmountPoisha).toBe(0);
    expect(line.finalSubtotalPoisha).toBe(0);
  });

  it("calculates multi-line cart totals with cart-level discount", () => {
    const line1 = calculateLinePricing({
      unitPricePoisha: 50000, // 500 BDT
      quantity: 2, // 1000 BDT = 100000 poisha
      discountType: "fixed",
      discountValue: 5000, // 50 BDT line discount -> 950 BDT
    });

    const line2 = calculateLinePricing({
      unitPricePoisha: 20000, // 200 BDT
      quantity: 1, // 200 BDT = 20000 poisha
      discountType: "none",
    });

    // Cart total before cart discount: (1000 - 50) + 200 = 1150 BDT = 115000 poisha
    // Apply 10% cart discount: 115000 * 0.10 = 11500 poisha
    const cartTotals = calculateCartTotals({
      lines: [line1, line2],
      cartDiscountType: "percent",
      cartDiscountValue: 10,
    });

    expect(cartTotals.subtotalPoisha).toBe(120000); // 1200.00 BDT
    expect(cartTotals.itemDiscountsPoisha).toBe(5000); // 50.00 BDT
    expect(cartTotals.cartDiscountPoisha).toBe(11500); // 115.00 BDT
    expect(cartTotals.totalDiscountPoisha).toBe(16500); // 165.00 BDT
    expect(cartTotals.totalAmountPoisha).toBe(103500); // 1035.00 BDT
  });

  it("calculates split payments, cash change, and outstanding due", () => {
    const totalAmountPoisha = 150000; // 1500.00 BDT

    // Case A: Partial payment with due
    const partialPayment = calculatePaymentBreakdown({
      totalAmountPoisha,
      payments: [
        { method: "cash", amountPoisha: 50000 }, // 500 BDT
        { method: "bkash", amountPoisha: 50000 }, // 500 BDT
      ],
    });

    expect(partialPayment.totalPaidPoisha).toBe(100000);
    expect(partialPayment.dueAmountPoisha).toBe(50000); // 500 BDT due
    expect(partialPayment.changeAmountPoisha).toBe(0);
    expect(partialPayment.hasDue).toBe(true);
    expect(partialPayment.isFullyPaid).toBe(false);

    // Case B: Overpayment with cash returning change
    const overPayment = calculatePaymentBreakdown({
      totalAmountPoisha,
      payments: [
        { method: "cash", amountPoisha: 200000 }, // 2000 BDT tendered
      ],
    });

    expect(overPayment.totalPaidPoisha).toBe(200000);
    expect(overPayment.dueAmountPoisha).toBe(0);
    expect(overPayment.changeAmountPoisha).toBe(50000); // 500 BDT change
    expect(overPayment.hasDue).toBe(false);
    expect(overPayment.isFullyPaid).toBe(true);
  });

  it("detects tampered client payload and recomputes authoritative total server-side", () => {
    // Client sends an item with 100.00 BDT retail price, but claims total is 10.00 BDT!
    const verification = verifyAndRecomputePayload({
      serverItems: [
        {
          variantId: "00000000-0000-0000-0000-000000000001",
          retailPricePoisha: 10000, // Real price: 100 BDT
          taxRateBasisPoints: 0,
          quantity: 1,
        },
      ],
      clientReportedTotalPoisha: 1000, // Tampered client payload: claims 10 BDT!
    });

    expect(verification.isTampered).toBe(true);
    // True server-calculated total
    expect(verification.authoritativeCartTotals.totalAmountPoisha).toBe(10000);
  });
});
