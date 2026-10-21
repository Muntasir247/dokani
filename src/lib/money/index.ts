/**
 * Money and Currency Utilities for Dokani POS
 *
 * Core Principle: Money is ALWAYS calculated and stored as integer minor units
 * (poisha in Bangladesh: 1 BDT = 100 poisha). Floating point math is strictly forbidden
 * for financial totals and balances.
 */

export const POISHA_PER_TAKA = 100;
export const DEFAULT_CURRENCY = "BDT";
export const CURRENCY_SYMBOL = "৳";

/**
 * Converts Bangladeshi Taka (decimal number or string) to integer Poisha.
 * Uses Math.round to safely eliminate floating-point representation anomalies.
 * Example: toPoisha("120.50") -> 12050
 */
export function toPoisha(taka: number | string): number {
  const numericTaka = typeof taka === "string" ? parseFloat(taka) : taka;
  if (isNaN(numericTaka)) {
    throw new Error(`Invalid monetary amount: ${taka}`);
  }
  return Math.round(numericTaka * POISHA_PER_TAKA);
}

/**
 * Converts integer Poisha to Taka decimal.
 * Example: toTaka(12050) -> 120.5
 */
export function toTaka(poisha: number): number {
  if (!Number.isInteger(poisha)) {
    throw new Error(`Poisha value must be an integer, received: ${poisha}`);
  }
  return poisha / POISHA_PER_TAKA;
}

export const fromPoisha = toTaka;

/**
 * Formats integer Poisha into a human-readable BDT currency string.
 * Example: formatBDT(165000) -> "৳1,650.00"
 */
export function formatBDT(
  poisha: number,
  options: {
    showSymbol?: boolean;
    locale?: "en-BD" | "bn-BD";
  } = {}
): string {
  const { showSymbol = true, locale = "en-BD" } = options;
  const taka = toTaka(poisha);

  const formattedNumber = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(taka);

  if (!showSymbol) {
    return formattedNumber;
  }

  return `${CURRENCY_SYMBOL} ${formattedNumber}`;
}

/**
 * Calculates tax on an integer poisha amount using explicit banker's/half-up rounding.
 * Example: calculateTax(10000, 5.0) -> 500 (5% of 100 BDT is 5 BDT)
 */
export function calculateTax(subtotalPoisha: number, taxRatePercent: number): number {
  if (subtotalPoisha < 0) {
    throw new Error("Subtotal cannot be negative");
  }
  if (taxRatePercent < 0) {
    throw new Error("Tax rate cannot be negative");
  }
  return Math.round((subtotalPoisha * taxRatePercent) / 100);
}

/**
 * Calculates discount amount in poisha from a percentage discount.
 * Example: calculateDiscountPercent(10000, 10) -> 1000 (10% of 100 BDT is 10 BDT)
 */
export function calculateDiscountPercent(
  subtotalPoisha: number,
  discountPercent: number
): number {
  if (subtotalPoisha < 0) {
    throw new Error("Subtotal cannot be negative");
  }
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error("Discount percentage must be between 0 and 100");
  }
  return Math.round((subtotalPoisha * discountPercent) / 100);
}

/**
 * Safely sums an array of integer poisha amounts.
 */
export function sumPoisha(...amounts: number[]): number {
  return amounts.reduce((acc, curr) => {
    if (!Number.isInteger(curr)) {
      throw new Error(`Invalid non-integer poisha value: ${curr}`);
    }
    return acc + curr;
  }, 0);
}
