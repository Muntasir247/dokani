import { describe, it, expect } from "vitest";
import {
  calculateLineItemProfit,
  calculateGrossProfit,
  calculateMarginPercentage,
  calculateNetProfit,
  SaleItemAccounting,
} from "@/features/reports/profit-calc";

describe("Analytics & Profit Margin Accounting (Hand-Calculated Verification)", () => {
  /**
   * Hand-calculated scenario:
   * Item 1:
   *   Quantity: 3 units
   *   Unit Retail Price: ৳1,200 (120,000 poisha)
   *   Unit Cost Price at Sale Time: ৳850 (85,000 poisha)
   *   Line Discount: ৳100 (10,000 poisha)
   *
   *   Expected Revenue: 3 * 120,000 - 10,000 = 350,000 poisha (৳3,500)
   *   Expected COGS: 3 * 85,000 = 255,000 poisha (৳2,550)
   *   Expected Gross Profit: 350,000 - 255,000 = 95,000 poisha (৳950)
   *   Expected Gross Margin: (95,000 / 350,000) * 100 = 27.1428...% -> 27.14%
   */
  it("matches hand-calculated profit and margin for a discounted line item", () => {
    const item: SaleItemAccounting = {
      quantity: 3,
      unitPricePoisha: 120000,
      unitCostPoisha: 85000,
      discountPoisha: 10000,
    };

    const result = calculateLineItemProfit(item);

    expect(result.revenuePoisha).toBe(350000); // ৳3,500.00
    expect(result.cogsPoisha).toBe(255000); // ৳2,550.00
    expect(result.grossProfitPoisha).toBe(95000); // ৳950.00
    expect(result.marginPct).toBe(27.14);
  });

  /**
   * Hand-calculated scenario 2:
   * Multiple sale items in an invoice:
   * Item A (Basmati Rice 5kg):
   *   Qty: 2, Price: ৳450 (45,000 poisha), Cost: ৳380 (38,000 poisha), Discount: 0
   *   Revenue: 90,000 poisha (৳900)
   *   Cost: 76,000 poisha (৳760)
   *   Gross Profit: 14,000 poisha (৳140)
   *
   * Item B (Mustard Oil 1L):
   *   Qty: 4, Price: ৳260 (26,000 poisha), Cost: ৳210 (21,000 poisha), Discount: ৳40 (4,000 poisha)
   *   Revenue: 4 * 26,000 - 4,000 = 100,000 poisha (৳1,000)
   *   Cost: 4 * 21,000 = 84,000 poisha (৳840)
   *   Gross Profit: 16,000 poisha (৳160)
   *
   * Combined Order:
   *   Total Revenue = 90,000 + 100,000 = 190,000 poisha (৳1,900)
   *   Total COGS = 76,000 + 84,000 = 160,000 poisha (৳1,600)
   *   Total Gross Profit = 190,000 - 160,000 = 30,000 poisha (৳300)
   *   Overall Gross Margin % = (30,000 / 190,000) * 100 = 15.789... -> 15.79%
   *
   * Operating Expenses for day:
   *   Electricity + Shop Rent = ৳120 (12,000 poisha)
   *   Expected Net Profit = 30,000 - 12,000 = 18,000 poisha (৳180)
   *   Net Margin % = (18,000 / 190,000) * 100 = 9.473... -> 9.47%
   */
  it("accurately calculates combined invoice totals, gross margin, and net profit", () => {
    const itemA = calculateLineItemProfit({
      quantity: 2,
      unitPricePoisha: 45000,
      unitCostPoisha: 38000,
    });
    const itemB = calculateLineItemProfit({
      quantity: 4,
      unitPricePoisha: 26000,
      unitCostPoisha: 21000,
      discountPoisha: 4000,
    });

    const totalRevenue = itemA.revenuePoisha + itemB.revenuePoisha;
    const totalCogs = itemA.cogsPoisha + itemB.cogsPoisha;
    const totalGrossProfit = calculateGrossProfit(totalRevenue, totalCogs);
    const grossMarginPct = calculateMarginPercentage(totalGrossProfit, totalRevenue);

    expect(totalRevenue).toBe(190000);
    expect(totalCogs).toBe(160000);
    expect(totalGrossProfit).toBe(30000);
    expect(grossMarginPct).toBe(15.79);

    const expensesPoisha = 12000;
    const netProfit = calculateNetProfit(totalGrossProfit, expensesPoisha);
    const netMarginPct = calculateMarginPercentage(netProfit, totalRevenue);

    expect(netProfit).toBe(18000);
    expect(netMarginPct).toBe(9.47);
  });

  it("handles edge case: item sold at exact cost price (0% margin)", () => {
    const item = calculateLineItemProfit({
      quantity: 5,
      unitPricePoisha: 5000,
      unitCostPoisha: 5000,
    });

    expect(item.revenuePoisha).toBe(25000);
    expect(item.cogsPoisha).toBe(25000);
    expect(item.grossProfitPoisha).toBe(0);
    expect(item.marginPct).toBe(0);
  });

  it("handles edge case: clearance sale sold below cost (negative profit & margin)", () => {
    const item = calculateLineItemProfit({
      quantity: 2,
      unitPricePoisha: 3000, // Sold at ৳30
      unitCostPoisha: 5000, // Cost was ৳50
    });

    expect(item.revenuePoisha).toBe(6000);
    expect(item.cogsPoisha).toBe(10000);
    expect(item.grossProfitPoisha).toBe(-4000); // Loss of ৳40
    expect(item.marginPct).toBe(-66.67);
  });

  it("handles edge case: 100% complimentary discount (zero revenue)", () => {
    const item = calculateLineItemProfit({
      quantity: 1,
      unitPricePoisha: 20000,
      unitCostPoisha: 12000,
      discountPoisha: 20000, // 100% off
    });

    expect(item.revenuePoisha).toBe(0);
    expect(item.cogsPoisha).toBe(12000);
    expect(item.grossProfitPoisha).toBe(-12000);
    expect(item.marginPct).toBe(0); // Protected against Division by Zero
  });
});
