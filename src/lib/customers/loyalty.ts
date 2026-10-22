/**
 * Loyalty Points Domain Module
 *
 * All financial values are strictly represented in integer poisha (1 BDT = 100 poisha)
 * to eliminate IEEE 754 floating-point inaccuracies.
 */

export interface LoyaltyConfig {
  enabled: boolean;
  /** Number of poisha spent to earn 1 loyalty point (e.g., 1000 poisha = 10 BDT spent = 1 point) */
  earnRatePoisha: number;
  /** Value in poisha given for redeeming 1 loyalty point (e.g., 100 poisha = 1 point = 1 BDT discount) */
  redeemRatePoisha: number;
}

export interface LoyaltyRedemptionValidationResult {
  valid: boolean;
  error?: string;
  discountPoisha: number;
  pointsToDeduct: number;
}

/**
 * Calculates how many loyalty points are earned for a given paid amount.
 * Only completed paid amounts (tendered towards the sale) count towards earning points.
 */
export function calculateLoyaltyPointsEarned(
  paidAmountPoisha: number,
  earnRatePoisha: number,
  enabled: boolean
): number {
  if (!enabled) return 0;
  if (earnRatePoisha <= 0) return 0;
  if (paidAmountPoisha <= 0) return 0;

  return Math.floor(paidAmountPoisha / earnRatePoisha);
}

/**
 * Calculates the monetary discount value in poisha for a given number of points to redeem.
 */
export function calculateLoyaltyRedemptionDiscount(
  pointsToRedeem: number,
  redeemRatePoisha: number
): number {
  if (pointsToRedeem <= 0 || redeemRatePoisha <= 0) return 0;
  return Math.floor(pointsToRedeem * redeemRatePoisha);
}

/**
 * Calculates the maximum points a customer can redeem against an order,
 * ensuring they do not redeem more points than they hold, nor discount more than the order total.
 */
export function calculateMaxRedeemablePoints(
  availablePoints: number,
  maxBillDiscountPoisha: number,
  redeemRatePoisha: number,
  enabled: boolean = true
): number {
  if (!enabled || availablePoints <= 0 || maxBillDiscountPoisha <= 0 || redeemRatePoisha <= 0) {
    return 0;
  }

  // Max points needed to cover the bill
  const pointsToCoverBill = Math.floor(maxBillDiscountPoisha / redeemRatePoisha);
  return Math.min(availablePoints, pointsToCoverBill);
}

/**
 * Validates a customer's request to redeem loyalty points.
 */
export function validateLoyaltyRedemption(
  availablePoints: number,
  pointsToRedeem: number,
  orderTotalPoisha: number,
  config: LoyaltyConfig
): LoyaltyRedemptionValidationResult {
  if (pointsToRedeem <= 0) {
    return { valid: true, discountPoisha: 0, pointsToDeduct: 0 };
  }

  if (!config.enabled) {
    return {
      valid: false,
      error: "Loyalty rewards program is not enabled for this store",
      discountPoisha: 0,
      pointsToDeduct: 0,
    };
  }

  if (config.redeemRatePoisha <= 0) {
    return {
      valid: false,
      error: "Invalid loyalty redemption rate configured",
      discountPoisha: 0,
      pointsToDeduct: 0,
    };
  }

  if (pointsToRedeem > availablePoints) {
    return {
      valid: false,
      error: `Customer has only ${availablePoints} points available; cannot redeem ${pointsToRedeem}`,
      discountPoisha: 0,
      pointsToDeduct: 0,
    };
  }

  const discountPoisha = calculateLoyaltyRedemptionDiscount(
    pointsToRedeem,
    config.redeemRatePoisha
  );

  if (discountPoisha > orderTotalPoisha) {
    return {
      valid: false,
      error: `Points redemption value (${discountPoisha} poisha) exceeds order total (${orderTotalPoisha} poisha)`,
      discountPoisha: 0,
      pointsToDeduct: 0,
    };
  }

  return {
    valid: true,
    discountPoisha,
    pointsToDeduct: pointsToRedeem,
  };
}
