/**
 * Customer Dues and Credit Management Domain Module
 *
 * All amounts are strictly in integer poisha (1 BDT = 100 poisha).
 */

export interface OpenInvoice {
  id: string;
  invoiceNumber: string;
  dueAmountPoisha: number;
  soldAt: string;
}

export interface InvoicePaymentAllocation {
  invoiceId: string;
  invoiceNumber: string;
  allocatedPoisha: number;
  remainingDuePoisha: number;
}

export interface CreditLimitEvaluation {
  allowed: boolean;
  currentDuePoisha: number;
  additionalDuePoisha: number;
  projectedDuePoisha: number;
  creditLimitPoisha: number;
  remainingCreditPoisha: number;
  exceededAmountPoisha: number;
}

/**
 * Calculates net customer balance in poisha.
 * Positive balance = customer owes store (outstanding due).
 * Negative balance = store owes customer (credit/advance).
 */
export function calculateCustomerBalance(
  openingBalancePoisha: number,
  totalDueOnInvoicesPoisha: number,
  unallocatedPaymentsPoisha: number
): number {
  return openingBalancePoisha + totalDueOnInvoicesPoisha - unallocatedPaymentsPoisha;
}

/**
 * Evaluates whether adding an additional due amount violates the customer's credit limit.
 *
 * Rules:
 * - creditLimitPoisha === 0 means zero credit is allowed (strictly cash/prepaid).
 * - creditLimitPoisha < 0 means credit limit is unlimited.
 * - creditLimitPoisha > 0 means the projected total due cannot exceed this threshold.
 */
export function checkCreditLimit(
  currentDuePoisha: number,
  additionalDuePoisha: number,
  creditLimitPoisha: number
): CreditLimitEvaluation {
  const projectedDuePoisha = currentDuePoisha + additionalDuePoisha;

  if (creditLimitPoisha < 0) {
    // Unlimited credit
    return {
      allowed: true,
      currentDuePoisha,
      additionalDuePoisha,
      projectedDuePoisha,
      creditLimitPoisha,
      remainingCreditPoisha: Number.MAX_SAFE_INTEGER,
      exceededAmountPoisha: 0,
    };
  }

  const remainingCreditPoisha = Math.max(0, creditLimitPoisha - currentDuePoisha);
  const isAllowed = projectedDuePoisha <= creditLimitPoisha;
  const exceededAmountPoisha = isAllowed ? 0 : projectedDuePoisha - creditLimitPoisha;

  return {
    allowed: isAllowed,
    currentDuePoisha,
    additionalDuePoisha,
    projectedDuePoisha,
    creditLimitPoisha,
    remainingCreditPoisha,
    exceededAmountPoisha,
  };
}

/**
 * Allocates a payment amount across outstanding invoices in FIFO order (oldest first).
 * Any remainder not matched to an open invoice is returned as unallocated poisha.
 */
export function allocatePaymentFIFO(
  paymentAmountPoisha: number,
  openInvoices: OpenInvoice[]
): {
  allocations: InvoicePaymentAllocation[];
  unallocatedPoisha: number;
  totalAllocatedPoisha: number;
} {
  if (paymentAmountPoisha <= 0) {
    return {
      allocations: [],
      unallocatedPoisha: 0,
      totalAllocatedPoisha: 0,
    };
  }

  // Sort invoices ascending by date (oldest first)
  const sorted = [...openInvoices].sort(
    (a, b) => new Date(a.soldAt).getTime() - new Date(b.soldAt).getTime()
  );

  let remainingPayment = paymentAmountPoisha;
  const allocations: InvoicePaymentAllocation[] = [];
  let totalAllocated = 0;

  for (const inv of sorted) {
    if (remainingPayment <= 0) break;
    if (inv.dueAmountPoisha <= 0) continue;

    const toAllocate = Math.min(remainingPayment, inv.dueAmountPoisha);
    const remainingDue = inv.dueAmountPoisha - toAllocate;

    allocations.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      allocatedPoisha: toAllocate,
      remainingDuePoisha: remainingDue,
    });

    remainingPayment -= toAllocate;
    totalAllocated += toAllocate;
  }

  return {
    allocations,
    unallocatedPoisha: remainingPayment,
    totalAllocatedPoisha: totalAllocated,
  };
}
