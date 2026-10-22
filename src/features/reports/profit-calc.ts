/**
 * Pure Mathematical Calculations for Dokani POS Analytics & Accounting
 *
 * All amounts handled in integer poisha (1 BDT = 100 Poisha) to avoid floating point drift.
 */

export interface SaleItemAccounting {
  quantity: number;
  unitPricePoisha: number;
  unitCostPoisha: number;
  discountPoisha?: number;
}

export interface InventoryValuationInput {
  currentStock: number;
  unitCostPoisha: number;
  unitRetailPoisha: number;
}

/**
 * Calculates revenue, COGS, gross profit, and margin percentage for a sale line item.
 * Uses unit_cost locked at the exact moment of sale.
 */
export function calculateLineItemProfit(item: SaleItemAccounting): {
  revenuePoisha: number;
  cogsPoisha: number;
  grossProfitPoisha: number;
  marginPct: number;
} {
  const lineDiscount = Math.max(0, item.discountPoisha || 0);
  const revenuePoisha = Math.max(0, item.quantity * item.unitPricePoisha - lineDiscount);
  const cogsPoisha = Math.max(0, item.quantity * item.unitCostPoisha);
  const grossProfitPoisha = revenuePoisha - cogsPoisha;

  const marginPct =
    revenuePoisha > 0
      ? Number(((grossProfitPoisha / revenuePoisha) * 100).toFixed(2))
      : 0;

  return {
    revenuePoisha,
    cogsPoisha,
    grossProfitPoisha,
    marginPct,
  };
}

/**
 * Gross Profit = Total Revenue - Cost of Goods Sold (COGS)
 */
export function calculateGrossProfit(revenuePoisha: number, cogsPoisha: number): number {
  return revenuePoisha - cogsPoisha;
}

/**
 * Gross Margin % = (Gross Profit / Revenue) * 100
 */
export function calculateMarginPercentage(profitPoisha: number, revenuePoisha: number): number {
  if (revenuePoisha <= 0) return 0;
  return Number(((profitPoisha / revenuePoisha) * 100).toFixed(2));
}

/**
 * Net Profit = Gross Profit - Operating Expenses
 */
export function calculateNetProfit(grossProfitPoisha: number, expensesPoisha: number): number {
  return grossProfitPoisha - expensesPoisha;
}

/**
 * Inventory valuation aggregator for all stock items.
 */
export function calculateTotalInventoryValuation(items: InventoryValuationInput[]): {
  totalCostValuePoisha: number;
  totalRetailValuePoisha: number;
  potentialProfitPoisha: number;
  overallMarginPct: number;
} {
  let totalCostValuePoisha = 0;
  let totalRetailValuePoisha = 0;

  for (const item of items) {
    if (item.currentStock > 0) {
      totalCostValuePoisha += item.currentStock * item.unitCostPoisha;
      totalRetailValuePoisha += item.currentStock * item.unitRetailPoisha;
    }
  }

  const potentialProfitPoisha = totalRetailValuePoisha - totalCostValuePoisha;
  const overallMarginPct =
    totalRetailValuePoisha > 0
      ? Number(((potentialProfitPoisha / totalRetailValuePoisha) * 100).toFixed(2))
      : 0;

  return {
    totalCostValuePoisha,
    totalRetailValuePoisha,
    potentialProfitPoisha,
    overallMarginPct,
  };
}

/**
 * Cash drawer expected balance calculation:
 * Expected = Float + Cash Sales + Dues Collections + Cash In - Cash Out - Cash Refunds
 */
export function calculateExpectedDrawerCash(params: {
  openingFloatPoisha: number;
  cashSalesPoisha: number;
  cashDuesCollectedPoisha: number;
  cashInsPoisha: number;
  cashOutsPoisha: number;
  cashRefundsPoisha: number;
}): number {
  return (
    params.openingFloatPoisha +
    params.cashSalesPoisha +
    params.cashDuesCollectedPoisha +
    params.cashInsPoisha -
    params.cashOutsPoisha -
    params.cashRefundsPoisha
  );
}

/**
 * Cash drawer variance calculation:
 * Variance = Counted - Expected
 * Negative variance = Cash Shortage (Missing money)
 * Positive variance = Cash Surplus (Extra money)
 */
export function calculateDrawerVariance(
  expectedCashPoisha: number,
  countedCashPoisha: number
): {
  variancePoisha: number;
  hasDiscrepancy: boolean;
  isShortage: boolean;
  isSurplus: boolean;
} {
  const variancePoisha = countedCashPoisha - expectedCashPoisha;
  return {
    variancePoisha,
    hasDiscrepancy: variancePoisha !== 0,
    isShortage: variancePoisha < 0,
    isSurplus: variancePoisha > 0,
  };
}
