import { describe, it, expect } from "vitest";
import {
  calculateCustomerBalance,
  checkCreditLimit,
  allocatePaymentFIFO,
  OpenInvoice,
} from "@/lib/customers/dues";

describe("Customer Dues, Credit Limits & Allocation Math", () => {
  describe("calculateCustomerBalance", () => {
    it("correctly computes balance = openingBalance + invoiceDues - unallocatedPayments", () => {
      // Opening balance: 5,000 poisha (50 BDT)
      // Invoice dues: 25,000 poisha (250 BDT)
      // Unallocated payments: 10,000 poisha (100 BDT)
      // Expected current due = 5,000 + 25,000 - 10,000 = 20,000 poisha (200 BDT)
      const balance = calculateCustomerBalance(5000, 25000, 10000);
      expect(balance).toBe(20000);
    });

    it("handles zero opening balance and zero unallocated payments", () => {
      const balance = calculateCustomerBalance(0, 15000, 0);
      expect(balance).toBe(15000);
    });

    it("supports advance/credit balances (negative due)", () => {
      // Customer paid 10,000 poisha in advance without any open invoices
      const balance = calculateCustomerBalance(0, 0, 10000);
      expect(balance).toBe(-10000);
    });
  });

  describe("checkCreditLimit", () => {
    it("allows sale when projected balance is strictly within credit limit", () => {
      // Current due: 3,000 poisha
      // Additional due: 2,000 poisha
      // Limit: 10,000 poisha
      const evalResult = checkCreditLimit(3000, 2000, 10000);
      expect(evalResult.allowed).toBe(true);
      expect(evalResult.projectedDuePoisha).toBe(5000);
      expect(evalResult.remainingCreditPoisha).toBe(7000);
      expect(evalResult.exceededAmountPoisha).toBe(0);
    });

    it("allows sale when projected balance exactly matches credit limit", () => {
      const evalResult = checkCreditLimit(5000, 5000, 10000);
      expect(evalResult.allowed).toBe(true);
      expect(evalResult.remainingCreditPoisha).toBe(5000);
      expect(evalResult.exceededAmountPoisha).toBe(0);
    });

    it("blocks sale when projected balance exceeds credit limit", () => {
      // Current due: 8,000 poisha
      // Additional due: 5,000 poisha
      // Limit: 10,000 poisha
      const evalResult = checkCreditLimit(8000, 5000, 10000);
      expect(evalResult.allowed).toBe(false);
      expect(evalResult.projectedDuePoisha).toBe(13000);
      expect(evalResult.exceededAmountPoisha).toBe(3000);
    });

    it("enforces zero credit when credit limit is 0", () => {
      // 0 credit limit = strictly cash/prepaid
      const evalResult = checkCreditLimit(0, 500, 0);
      expect(evalResult.allowed).toBe(false);
      expect(evalResult.exceededAmountPoisha).toBe(500);
    });

    it("allows unlimited credit when credit limit is negative (-1)", () => {
      const evalResult = checkCreditLimit(500000, 1000000, -1);
      expect(evalResult.allowed).toBe(true);
      expect(evalResult.exceededAmountPoisha).toBe(0);
    });
  });

  describe("allocatePaymentFIFO", () => {
    const openInvoices: OpenInvoice[] = [
      { id: "inv-1", invoiceNumber: "INV-001", dueAmountPoisha: 5000, soldAt: "2026-10-01T10:00:00Z" },
      { id: "inv-2", invoiceNumber: "INV-002", dueAmountPoisha: 8000, soldAt: "2026-10-05T10:00:00Z" },
      { id: "inv-3", invoiceNumber: "INV-003", dueAmountPoisha: 12000, soldAt: "2026-10-10T10:00:00Z" },
    ];

    it("allocates partial payment to oldest invoice first (FIFO)", () => {
      // Customer pays 3,000 poisha
      const result = allocatePaymentFIFO(3000, openInvoices);

      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0]).toEqual({
        invoiceId: "inv-1",
        invoiceNumber: "INV-001",
        allocatedPoisha: 3000,
        remainingDuePoisha: 2000,
      });
      expect(result.unallocatedPoisha).toBe(0);
      expect(result.totalAllocatedPoisha).toBe(3000);
    });

    it("settles older invoices and partially pays the next in line", () => {
      // Customer pays 10,000 poisha:
      // Should pay off inv-1 (5,000) completely, then 5,000 towards inv-2 (leaving 3,000 due)
      const result = allocatePaymentFIFO(10000, openInvoices);

      expect(result.allocations).toHaveLength(2);
      expect(result.allocations[0]).toEqual({
        invoiceId: "inv-1",
        invoiceNumber: "INV-001",
        allocatedPoisha: 5000,
        remainingDuePoisha: 0,
      });
      expect(result.allocations[1]).toEqual({
        invoiceId: "inv-2",
        invoiceNumber: "INV-002",
        allocatedPoisha: 5000,
        remainingDuePoisha: 3000,
      });
      expect(result.unallocatedPoisha).toBe(0);
      expect(result.totalAllocatedPoisha).toBe(10000);
    });

    it("handles overpayment by leaving remainder in unallocatedPoisha", () => {
      // Total due across all 3 invoices = 5000 + 8000 + 12000 = 25,000 poisha
      // Customer pays 30,000 poisha
      const result = allocatePaymentFIFO(30000, openInvoices);

      expect(result.allocations).toHaveLength(3);
      expect(result.totalAllocatedPoisha).toBe(25000);
      expect(result.unallocatedPoisha).toBe(5000); // 50 BDT credit advance
    });

    it("returns empty allocations when payment is zero or negative", () => {
      const result = allocatePaymentFIFO(0, openInvoices);
      expect(result.allocations).toHaveLength(0);
      expect(result.totalAllocatedPoisha).toBe(0);
      expect(result.unallocatedPoisha).toBe(0);
    });
  });
});
