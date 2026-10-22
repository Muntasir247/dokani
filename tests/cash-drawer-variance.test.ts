import { describe, it, expect } from "vitest";
import {
  calculateExpectedDrawerCash,
  calculateDrawerVariance,
} from "@/features/reports/profit-calc";

describe("Cash Drawer Sessions & Register Shift Variance", () => {
  /**
   * Hand-calculated shift close scenario:
   * Shift Parameters:
   *   Opening Float: ৳500.00 (50,000 poisha)
   *   Cash Sales Collected: ৳3,450.00 (345,000 poisha)
   *   Customer Dues Paid in Cash: ৳1,000.00 (100,000 poisha)
   *   Cash In (Manager added change): ৳200.00 (20,000 poisha)
   *   Cash Out (Petty cash for supplies): ৳150.00 (15,000 poisha)
   *   Cash Refund on Customer Return: ৳300.00 (30,000 poisha)
   *
   * Expected Drawer Balance:
   *   = 50,000 + 345,000 + 100,000 + 20,000 - 15,000 - 30,000
   *   = 470,000 poisha (৳4,700.00)
   */
  it("accurately calculates expected cash balance from all register movements", () => {
    const expected = calculateExpectedDrawerCash({
      openingFloatPoisha: 50000,
      cashSalesPoisha: 345000,
      cashDuesCollectedPoisha: 100000,
      cashInsPoisha: 20000,
      cashOutsPoisha: 15000,
      cashRefundsPoisha: 30000,
    });

    expect(expected).toBe(470000); // ৳4,700.00
  });

  it("detects a cash shortage when counted cash is less than expected", () => {
    const expectedCashPoisha = 470000;
    const countedCashPoisha = 465000; // ৳4,650 (Shortage of ৳50)

    const result = calculateDrawerVariance(expectedCashPoisha, countedCashPoisha);

    expect(result.variancePoisha).toBe(-5000); // -৳50.00
    expect(result.hasDiscrepancy).toBe(true);
    expect(result.isShortage).toBe(true);
    expect(result.isSurplus).toBe(false);
  });

  it("detects a cash surplus when counted cash exceeds expected", () => {
    const expectedCashPoisha = 470000;
    const countedCashPoisha = 472500; // ৳4,725 (Surplus of ৳25)

    const result = calculateDrawerVariance(expectedCashPoisha, countedCashPoisha);

    expect(result.variancePoisha).toBe(2500); // +৳25.00
    expect(result.hasDiscrepancy).toBe(true);
    expect(result.isShortage).toBe(false);
    expect(result.isSurplus).toBe(true);
  });

  it("confirms perfect drawer balance when counted cash exactly equals expected", () => {
    const expectedCashPoisha = 470000;
    const countedCashPoisha = 470000;

    const result = calculateDrawerVariance(expectedCashPoisha, countedCashPoisha);

    expect(result.variancePoisha).toBe(0);
    expect(result.hasDiscrepancy).toBe(false);
    expect(result.isShortage).toBe(false);
    expect(result.isSurplus).toBe(false);
  });

  it("evaluates alert threshold for major cash drawer discrepancies (>= ৳100)", () => {
    const expectedCashPoisha = 500000;
    const countedCashPoisha = 485000; // ৳150 shortage (15,000 poisha)

    const result = calculateDrawerVariance(expectedCashPoisha, countedCashPoisha);
    const exceedsAlertThreshold = Math.abs(result.variancePoisha) >= 10000; // 10,000 poisha = ৳100

    expect(result.variancePoisha).toBe(-15000);
    expect(exceedsAlertThreshold).toBe(true);
  });
});
