/**
 * SaaS Billing Plan Configuration & Feature Flags
 *
 * Single source of truth driving both UI pricing matrices and server-side enforcement.
 * All monetary amounts are defined in both display BDT and integer minor units (poisha).
 */

import { PlanTier } from "@/types/database.types";

export type BillingInterval = "month" | "year";

export interface PlanLimits {
  /** Maximum number of store branches / outlets */
  maxStores: number;
  /** Maximum number of active staff members */
  maxStaff: number;
  /** Maximum active catalog products */
  maxProducts: number;
}

export interface PlanFeatures {
  /** Multi-outlet branches support */
  multiBranch: boolean;
  /** Per-unit IMEI / serial number warranty tracking */
  serialTracking: boolean;
  /** Export sales summaries, stock ledger, and customer CSVs */
  exportReports: boolean;
  /** Custom Code128 / EAN barcode label generator */
  customBarcode: boolean;
  /** Customer loyalty points rewards program */
  loyaltyRewards: boolean;
  /** B2B wholesale customer price tiers and credit limits */
  b2bWholesale: boolean;
  /** Public Developer REST API access */
  apiAccess: boolean;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  tagline: string;
  monthlyPriceBdt: number;
  monthlyPricePoisha: number;
  yearlyPriceBdt: number;
  yearlyPricePoisha: number;
  limits: PlanLimits;
  features: PlanFeatures;
  popular?: boolean;
}

export interface ProrationResult {
  currentTier: PlanTier;
  newTier: PlanTier;
  interval: BillingInterval;
  daysRemaining: number;
  totalDays: number;
  unusedCurrentCreditPoisha: number;
  newPlanCostPoisha: number;
  netPayablePoisha: number;
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    tier: "free",
    name: "Free Starter",
    tagline: "For small independent retail counters just getting started",
    monthlyPriceBdt: 0,
    monthlyPricePoisha: 0,
    yearlyPriceBdt: 0,
    yearlyPricePoisha: 0,
    limits: {
      maxStores: 1,
      maxStaff: 2,
      maxProducts: 200,
    },
    features: {
      multiBranch: false,
      serialTracking: false,
      exportReports: false,
      customBarcode: false,
      loyaltyRewards: false,
      b2bWholesale: false,
      apiAccess: false,
    },
    popular: false,
  },
  pro: {
    tier: "pro",
    name: "Pro Merchant",
    tagline: "For fast-growing retail shops needing serial tracking and reports",
    monthlyPriceBdt: 1500,
    monthlyPricePoisha: 150000,
    yearlyPriceBdt: 15000, // 2 months discount
    yearlyPricePoisha: 1500000,
    limits: {
      maxStores: 3,
      maxStaff: 10,
      maxProducts: 5000,
    },
    features: {
      multiBranch: true,
      serialTracking: true,
      exportReports: true,
      customBarcode: true,
      loyaltyRewards: true,
      b2bWholesale: true,
      apiAccess: false,
    },
    popular: true,
  },
  business: {
    tier: "business",
    name: "Business Enterprise",
    tagline: "For multi-branch retail chains needing enterprise capacity and API",
    monthlyPriceBdt: 4000,
    monthlyPricePoisha: 400000,
    yearlyPriceBdt: 40000,
    yearlyPricePoisha: 4000000,
    limits: {
      maxStores: 999,
      maxStaff: 999,
      maxProducts: 100000,
    },
    features: {
      multiBranch: true,
      serialTracking: true,
      exportReports: true,
      customBarcode: true,
      loyaltyRewards: true,
      b2bWholesale: true,
      apiAccess: true,
    },
    popular: false,
  },
};

/**
 * Retrieves the full plan definition for a tier.
 */
export function getPlanConfig(tier: PlanTier): PlanDefinition {
  return PLANS[tier] || PLANS.free;
}

/**
 * Checks whether a specific feature flag is permitted for a given plan tier.
 */
export function isFeatureAllowed(tier: PlanTier, feature: keyof PlanFeatures): boolean {
  const plan = getPlanConfig(tier);
  return Boolean(plan.features[feature]);
}

/**
 * Checks whether creating an additional resource would violate plan capacity limits.
 */
export function checkResourceLimit(
  tier: PlanTier,
  resource: keyof PlanLimits,
  currentCount: number
): {
  allowed: boolean;
  maxAllowed: number;
  currentCount: number;
  remaining: number;
} {
  const plan = getPlanConfig(tier);
  const maxAllowed = plan.limits[resource];
  const allowed = currentCount < maxAllowed;
  const remaining = Math.max(0, maxAllowed - currentCount);

  return {
    allowed,
    maxAllowed,
    currentCount,
    remaining,
  };
}

/**
 * Calculates exact prorated upgrade/downgrade financial amounts.
 *
 * Proration Policy:
 * 1. The unused balance of the current period is calculated as:
 *    credit = currentPlanPrice * (daysRemaining / totalDaysInPeriod)
 * 2. The cost of the new plan for the remaining duration is:
 *    newCost = newPlanPrice * (daysRemaining / totalDaysInPeriod)
 * 3. Net payable = Math.max(0, newCost - credit)
 * All math is calculated in integer poisha with floor rounding to prevent fractions.
 */
export function calculateProration(
  currentTier: PlanTier,
  newTier: PlanTier,
  interval: BillingInterval,
  daysRemaining: number,
  totalDays: number
): ProrationResult {
  const currentPlan = getPlanConfig(currentTier);
  const newPlan = getPlanConfig(newTier);

  const currentPrice = interval === "year" ? currentPlan.yearlyPricePoisha : currentPlan.monthlyPricePoisha;
  const newPrice = interval === "year" ? newPlan.yearlyPricePoisha : newPlan.monthlyPricePoisha;

  if (daysRemaining <= 0 || totalDays <= 0) {
    return {
      currentTier,
      newTier,
      interval,
      daysRemaining: 0,
      totalDays: Math.max(1, totalDays),
      unusedCurrentCreditPoisha: 0,
      newPlanCostPoisha: newPrice,
      netPayablePoisha: newPrice,
    };
  }

  const fraction = Math.min(1, Math.max(0, daysRemaining / totalDays));
  const unusedCurrentCreditPoisha = Math.floor(currentPrice * fraction);
  const newPlanCostPoisha = Math.floor(newPrice * fraction);
  const netPayablePoisha = Math.max(0, newPlanCostPoisha - unusedCurrentCreditPoisha);

  return {
    currentTier,
    newTier,
    interval,
    daysRemaining,
    totalDays,
    unusedCurrentCreditPoisha,
    newPlanCostPoisha,
    netPayablePoisha,
  };
}
