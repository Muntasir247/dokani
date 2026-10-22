import { describe, it, expect } from "vitest";
import {
  calculateTotalInventoryValuation,
  InventoryValuationInput,
} from "@/features/reports/profit-calc";

describe("Inventory Valuation & Asset Calculations", () => {
  it("accurately computes total cost value, total retail value, and potential profit", () => {
    /**
     * Hand-calculated stock valuation:
     * Product 1: 50 units @ Cost ৳100 (10,000 poisha), Retail ৳150 (15,000 poisha)
     *   Cost Value: 50 * 10,000 = 500,000 poisha (৳5,000)
     *   Retail Value: 50 * 15,000 = 750,000 poisha (৳7,500)
     *
     * Product 2: 20 units @ Cost ৳400 (40,000 poisha), Retail ৳600 (60,000 poisha)
     *   Cost Value: 20 * 40,000 = 800,000 poisha (৳8,000)
     *   Retail Value: 20 * 60,000 = 1,200,000 poisha (৳12,000)
     *
     * Total Cost Value = 500,000 + 800,000 = 1,300,000 poisha (৳13,000)
     * Total Retail Value = 750,000 + 1,200,000 = 1,950,000 poisha (৳19,500)
     * Total Potential Profit = 1,950,000 - 1,300,000 = 650,000 poisha (৳6,500)
     * Overall Margin % = (650,000 / 1,950,000) * 100 = 33.3333% -> 33.33%
     */
    const items: InventoryValuationInput[] = [
      { currentStock: 50, unitCostPoisha: 10000, unitRetailPoisha: 15000 },
      { currentStock: 20, unitCostPoisha: 40000, unitRetailPoisha: 60000 },
    ];

    const result = calculateTotalInventoryValuation(items);

    expect(result.totalCostValuePoisha).toBe(1300000);
    expect(result.totalRetailValuePoisha).toBe(1950000);
    expect(result.potentialProfitPoisha).toBe(650000);
    expect(result.overallMarginPct).toBe(33.33);
  });

  it("handles out of stock items (zero stock) without altering total asset value", () => {
    const items: InventoryValuationInput[] = [
      { currentStock: 10, unitCostPoisha: 50000, unitRetailPoisha: 70000 },
      { currentStock: 0, unitCostPoisha: 80000, unitRetailPoisha: 120000 }, // Out of stock
    ];

    const result = calculateTotalInventoryValuation(items);

    expect(result.totalCostValuePoisha).toBe(500000);
    expect(result.totalRetailValuePoisha).toBe(700000);
    expect(result.potentialProfitPoisha).toBe(200000);
    expect(result.overallMarginPct).toBe(28.57);
  });

  it("handles empty inventory gracefully", () => {
    const result = calculateTotalInventoryValuation([]);

    expect(result.totalCostValuePoisha).toBe(0);
    expect(result.totalRetailValuePoisha).toBe(0);
    expect(result.potentialProfitPoisha).toBe(0);
    expect(result.overallMarginPct).toBe(0);
  });
});
