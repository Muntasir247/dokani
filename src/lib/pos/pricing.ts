import { UserRole, PaymentMethod } from "@/types/database.types";

export interface LineItemPricingInput {
  unitPricePoisha: number; // In integer poisha
  quantity: number;
  discountType?: "none" | "percent" | "fixed";
  discountValue?: number; // percent (e.g. 10 for 10%) or poisha
  taxRateBasisPoints?: number; // e.g. 500 = 5.00%
  role?: UserRole;
  maxCashierDiscountPercent?: number; // Default 10%
}

export interface LineItemPricingResult {
  unitPricePoisha: number;
  quantity: number;
  rawSubtotalPoisha: number;
  discountAmountPoisha: number;
  taxableAmountPoisha: number;
  taxAmountPoisha: number;
  finalSubtotalPoisha: number;
}

export interface CartTotalsInput {
  lines: LineItemPricingResult[];
  cartDiscountType?: "none" | "percent" | "fixed";
  cartDiscountValue?: number;
  role?: UserRole;
  maxCashierDiscountPercent?: number;
}

export interface CartTotalsResult {
  subtotalPoisha: number;
  itemDiscountsPoisha: number;
  cartDiscountPoisha: number;
  totalDiscountPoisha: number;
  totalTaxPoisha: number;
  totalAmountPoisha: number;
}

export interface PaymentBreakdownInput {
  totalAmountPoisha: number;
  payments: Array<{
    method: PaymentMethod;
    amountPoisha: number;
  }>;
}

export interface PaymentBreakdownResult {
  totalPaidPoisha: number;
  dueAmountPoisha: number;
  changeAmountPoisha: number;
  isFullyPaid: boolean;
  hasDue: boolean;
}

/**
 * Calculates line-item totals, discounts, and taxes with role-limited discount caps
 * and strict integer poisha rounding.
 */
export function calculateLinePricing(input: LineItemPricingInput): LineItemPricingResult {
  const {
    unitPricePoisha,
    quantity,
    discountType = "none",
    discountValue = 0,
    taxRateBasisPoints = 0,
    role,
    maxCashierDiscountPercent = 10,
  } = input;

  if (quantity <= 0) {
    throw new Error("Quantity must be greater than zero");
  }
  if (unitPricePoisha < 0) {
    throw new Error("Unit price cannot be negative");
  }

  const rawSubtotalPoisha = Math.round(unitPricePoisha * quantity);
  let discountAmountPoisha = 0;

  if (discountType === "percent" && discountValue > 0) {
    let effectivePercent = discountValue;
    if (role === "cashier" && effectivePercent > maxCashierDiscountPercent) {
      effectivePercent = maxCashierDiscountPercent;
    }
    discountAmountPoisha = Math.round((rawSubtotalPoisha * effectivePercent) / 100);
  } else if (discountType === "fixed" && discountValue > 0) {
    let effectiveFixed = Math.round(discountValue);
    if (role === "cashier") {
      const maxAllowed = Math.round((rawSubtotalPoisha * maxCashierDiscountPercent) / 100);
      if (effectiveFixed > maxAllowed) {
        effectiveFixed = maxAllowed;
      }
    }
    discountAmountPoisha = effectiveFixed;
  }

  // Discount cannot exceed line subtotal
  if (discountAmountPoisha > rawSubtotalPoisha) {
    discountAmountPoisha = rawSubtotalPoisha;
  }

  const taxableAmountPoisha = rawSubtotalPoisha - discountAmountPoisha;
  const taxAmountPoisha =
    taxRateBasisPoints > 0
      ? Math.round((taxableAmountPoisha * taxRateBasisPoints) / 10000)
      : 0;

  const finalSubtotalPoisha = taxableAmountPoisha + taxAmountPoisha;

  return {
    unitPricePoisha,
    quantity,
    rawSubtotalPoisha,
    discountAmountPoisha,
    taxableAmountPoisha,
    taxAmountPoisha,
    finalSubtotalPoisha,
  };
}

/**
 * Calculates cart-level totals, applying overall cart discount after line discounts.
 */
export function calculateCartTotals(input: CartTotalsInput): CartTotalsResult {
  const {
    lines,
    cartDiscountType = "none",
    cartDiscountValue = 0,
    role,
    maxCashierDiscountPercent = 10,
  } = input;

  const subtotalPoisha = lines.reduce((acc, l) => acc + l.rawSubtotalPoisha, 0);
  const itemDiscountsPoisha = lines.reduce((acc, l) => acc + l.discountAmountPoisha, 0);
  const netBeforeCartDiscount = subtotalPoisha - itemDiscountsPoisha;

  let cartDiscountPoisha = 0;
  if (cartDiscountType === "percent" && cartDiscountValue > 0) {
    let effectivePercent = cartDiscountValue;
    if (role === "cashier" && effectivePercent > maxCashierDiscountPercent) {
      effectivePercent = maxCashierDiscountPercent;
    }
    cartDiscountPoisha = Math.round((netBeforeCartDiscount * effectivePercent) / 100);
  } else if (cartDiscountType === "fixed" && cartDiscountValue > 0) {
    let effectiveFixed = Math.round(cartDiscountValue);
    if (role === "cashier") {
      const maxAllowed = Math.round((netBeforeCartDiscount * maxCashierDiscountPercent) / 100);
      if (effectiveFixed > maxAllowed) {
        effectiveFixed = maxAllowed;
      }
    }
    cartDiscountPoisha = effectiveFixed;
  }

  if (cartDiscountPoisha > netBeforeCartDiscount) {
    cartDiscountPoisha = netBeforeCartDiscount;
  }

  const totalDiscountPoisha = itemDiscountsPoisha + cartDiscountPoisha;
  const totalTaxPoisha = lines.reduce((acc, l) => acc + l.taxAmountPoisha, 0);
  const totalAmountPoisha = subtotalPoisha - totalDiscountPoisha + totalTaxPoisha;

  return {
    subtotalPoisha,
    itemDiscountsPoisha,
    cartDiscountPoisha,
    totalDiscountPoisha,
    totalTaxPoisha,
    totalAmountPoisha,
  };
}

/**
 * Breaks down payments into paid, due, and change.
 */
export function calculatePaymentBreakdown(input: PaymentBreakdownInput): PaymentBreakdownResult {
  const { totalAmountPoisha, payments } = input;

  const totalPaidPoisha = payments.reduce((acc, p) => acc + Math.round(p.amountPoisha), 0);

  let dueAmountPoisha = 0;
  let changeAmountPoisha = 0;

  if (totalPaidPoisha >= totalAmountPoisha) {
    dueAmountPoisha = 0;
    changeAmountPoisha = totalPaidPoisha - totalAmountPoisha;
  } else {
    dueAmountPoisha = totalAmountPoisha - totalPaidPoisha;
    changeAmountPoisha = 0;
  }

  return {
    totalPaidPoisha,
    dueAmountPoisha,
    changeAmountPoisha,
    isFullyPaid: dueAmountPoisha === 0,
    hasDue: dueAmountPoisha > 0,
  };
}

/**
 * Validates whether a client payload matches server recalculations or has been tampered with.
 */
export function verifyAndRecomputePayload(params: {
  serverItems: Array<{
    variantId: string;
    retailPricePoisha: number;
    taxRateBasisPoints: number;
    quantity: number;
    discountType?: "none" | "percent" | "fixed";
    discountValue?: number;
  }>;
  cartDiscountType?: "none" | "percent" | "fixed";
  cartDiscountValue?: number;
  clientReportedTotalPoisha?: number;
  role?: UserRole;
}): {
  isTampered: boolean;
  authoritativeCartTotals: CartTotalsResult;
  lines: LineItemPricingResult[];
} {
  const lines = params.serverItems.map((item) =>
    calculateLinePricing({
      unitPricePoisha: item.retailPricePoisha,
      quantity: item.quantity,
      discountType: item.discountType,
      discountValue: item.discountValue,
      taxRateBasisPoints: item.taxRateBasisPoints,
      role: params.role,
    })
  );

  const authoritativeCartTotals = calculateCartTotals({
    lines,
    cartDiscountType: params.cartDiscountType,
    cartDiscountValue: params.cartDiscountValue,
    role: params.role,
  });

  const isTampered =
    params.clientReportedTotalPoisha !== undefined &&
    params.clientReportedTotalPoisha !== authoritativeCartTotals.totalAmountPoisha;

  return {
    isTampered,
    authoritativeCartTotals,
    lines,
  };
}
