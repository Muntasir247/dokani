import { describe, it, expect } from "vitest";
import {
  calculateWeightedAverageCost,
  calculateInventoryValuation,
} from "@/lib/inventory/cost";

describe("Weighted Average Cost (WAC) Unit Tests", () => {
  it("calculates exact weighted average for standard positive purchases", () => {
    // Current: 10 units @ 100.00 BDT (10,000 poisha)
    // Incoming: 20 units @ 130.00 BDT (13,000 poisha)
    // Total value = (10 * 10000) + (20 * 13000) = 100,000 + 260,000 = 360,000 poisha
    // Total qty = 30 units
    // Expected unit cost = 360,000 / 30 = 12,000 poisha (120.00 BDT)
    const result = calculateWeightedAverageCost({
      currentStock: 10,
      currentCostPoisha: 10000,
      incomingQuantity: 20,
      incomingCostPoisha: 13000,
    });

    expect(result).toBe(12000);
  });

  it("handles zero stock: new cost strictly adopts incoming purchase cost", () => {
    const result = calculateWeightedAverageCost({
      currentStock: 0,
      currentCostPoisha: 15000, // Old historical cost from exhausted stock
      incomingQuantity: 50,
      incomingCostPoisha: 20000, // New batch @ 200.00 BDT
    });

    expect(result).toBe(20000);
  });

  it("handles negative stock (oversold state): new cost adopts incoming purchase cost", () => {
    // If shop had -3 units in system due to pending receipt, incoming 10 units sets baseline
    const result = calculateWeightedAverageCost({
      currentStock: -3,
      currentCostPoisha: 8000,
      incomingQuantity: 10,
      incomingCostPoisha: 9500,
    });

    expect(result).toBe(9500);
  });

  it("preserves unit cost when incoming quantity is zero", () => {
    const result = calculateWeightedAverageCost({
      currentStock: 25,
      currentCostPoisha: 14500,
      incomingQuantity: 0,
      incomingCostPoisha: 18000,
    });

    expect(result).toBe(14500);
  });

  it("preserves unit cost on returns to supplier / negative adjustments", () => {
    // In AVCO, returning 5 units out of 20 at cost does not alter the average cost of remaining 15 units
    const result = calculateWeightedAverageCost({
      currentStock: 20,
      currentCostPoisha: 12500,
      incomingQuantity: -5,
      incomingCostPoisha: 12500,
    });

    expect(result).toBe(12500);
  });

  it("correctly rounds non-integer division to nearest integer poisha without precision drift", () => {
    // 7 units @ 1000 poisha (7,000 poisha)
    // 4 units @ 1500 poisha (6,000 poisha)
    // Total value = 13,000 poisha / 11 units = 1181.8181... -> rounds to 1182 poisha
    const result = calculateWeightedAverageCost({
      currentStock: 7,
      currentCostPoisha: 1000,
      incomingQuantity: 4,
      incomingCostPoisha: 1500,
    });

    expect(result).toBe(1182);
  });

  it("handles initial unpriced stock (current cost 0) receiving first priced purchase", () => {
    const result = calculateWeightedAverageCost({
      currentStock: 10,
      currentCostPoisha: 0,
      incomingQuantity: 10,
      incomingCostPoisha: 5000,
    });

    // (10 * 0 + 10 * 5000) / 20 = 2500 poisha
    expect(result).toBe(2500);
  });

  it("computes accurate total inventory valuation across multiple variant lines", () => {
    const variants = [
      { quantity: 15, costPricePoisha: 10000 }, // 150,000 poisha
      { quantity: 30, costPricePoisha: 5000 },  // 150,000 poisha
      { quantity: 0, costPricePoisha: 12000 },  // 0 poisha
      { quantity: -2, costPricePoisha: 9000 },  // clamped to 0
    ];

    const valuation = calculateInventoryValuation(variants);
    expect(valuation.totalQuantity).toBe(45);
    expect(valuation.totalValuePoisha).toBe(300000);
  });
});
