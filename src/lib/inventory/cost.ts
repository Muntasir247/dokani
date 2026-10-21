/**
 * Weighted Average Cost (WAC / AVCO) Calculation Engine
 * Minor unit poisha (1 BDT = 100 poisha). All monetary amounts are integers.
 */

export interface CostCalculationParams {
  currentStock: number;
  currentCostPoisha: number;
  incomingQuantity: number;
  incomingCostPoisha: number;
}

/**
 * Calculates the new weighted-average unit cost (in integer poisha)
 * when new stock is purchased and added to existing inventory.
 *
 * Formula:
 * New WAC = Round(( (CurrentStock * CurrentCost) + (IncomingQty * IncomingCost) ) / (CurrentStock + IncomingQty))
 *
 * Edge cases handled:
 * 1. Current stock is zero: New cost is strictly the incoming purchase cost.
 * 2. Current stock is negative (e.g. oversold/unrecorded movement): New cost is the incoming purchase cost.
 * 3. Incoming quantity is zero: Cost remains unchanged.
 * 4. Negative incoming quantity (e.g. supplier return): In AVCO, reducing stock at cost does not alter unit cost.
 * 5. Current cost is zero (e.g. initial free sample/unpriced opening): Weighted strictly by incoming value.
 */
export function calculateWeightedAverageCost({
  currentStock,
  currentCostPoisha,
  incomingQuantity,
  incomingCostPoisha,
}: CostCalculationParams): number {
  // If no incoming stock, retain current cost
  if (incomingQuantity === 0) {
    return Math.max(0, Math.round(currentCostPoisha));
  }

  // If reducing stock (supplier return or deduction), unit cost of remaining inventory is preserved
  if (incomingQuantity < 0) {
    return Math.max(0, Math.round(currentCostPoisha));
  }

  // Edge case: If current stock is 0 or negative, the new inventory batch establishes the new base cost
  if (currentStock <= 0) {
    return Math.max(0, Math.round(incomingCostPoisha));
  }

  const currentTotalValue = currentStock * currentCostPoisha;
  const incomingTotalValue = incomingQuantity * incomingCostPoisha;
  const newTotalQuantity = currentStock + incomingQuantity;

  if (newTotalQuantity <= 0) {
    return Math.max(0, Math.round(incomingCostPoisha));
  }

  const newAverageCost = (currentTotalValue + incomingTotalValue) / newTotalQuantity;

  // Minor unit integer poisha (nearest integer)
  return Math.round(newAverageCost);
}

/**
 * Helper to compute total inventory value in poisha across an array of variants with stock.
 */
export function calculateInventoryValuation(
  items: Array<{ quantity: number; costPricePoisha: number }>
): { totalQuantity: number; totalValuePoisha: number } {
  let totalQuantity = 0;
  let totalValuePoisha = 0;

  for (const item of items) {
    const qty = Math.max(0, item.quantity);
    totalQuantity += qty;
    totalValuePoisha += qty * Math.max(0, item.costPricePoisha);
  }

  return { totalQuantity, totalValuePoisha };
}
