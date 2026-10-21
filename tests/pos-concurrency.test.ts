import { describe, it, expect } from "vitest";

/**
 * Simulates a PostgreSQL database row with transactional row-level locking (FOR UPDATE)
 * and append-only stock movement ledger to test concurrent checkout behavior.
 */
class ConcurrentInventoryEngine {
  private stock: number;
  private isLocked: boolean = false;
  private lockQueue: Array<() => void> = [];
  public ledgerMovements: Array<{ type: string; quantity: number }> = [];
  public completedSales: string[] = [];
  public rejectedSales: string[] = [];

  constructor(initialStock: number) {
    this.stock = initialStock;
  }

  // Simulates PostgreSQL SELECT ... FOR UPDATE
  private async acquireRowLock(): Promise<() => void> {
    if (!this.isLocked) {
      this.isLocked = true;
      return () => this.releaseRowLock();
    }

    return new Promise((resolve) => {
      this.lockQueue.push(() => {
        this.isLocked = true;
        resolve(() => this.releaseRowLock());
      });
    });
  }

  private releaseRowLock(): void {
    if (this.lockQueue.length > 0) {
      const nextInLine = this.lockQueue.shift()!;
      nextInLine();
    } else {
      this.isLocked = false;
    }
  }

  /**
   * Executes fn_create_sale transactional logic under row lock.
   */
  async processSaleTransaction(params: {
    transactionId: string;
    requestedQuantity: number;
  }): Promise<{ success: boolean; invoiceNumber?: string; error?: string }> {
    const unlock = await this.acquireRowLock();

    try {
      // Simulate small DB I/O latency (10-20ms) inside transaction
      await new Promise((r) => setTimeout(r, 15));

      // Check available stock (SELECT fn_get_stock_quantity)
      if (this.stock < params.requestedQuantity) {
        this.rejectedSales.push(params.transactionId);
        throw new Error(
          `INSUFFICIENT_STOCK: Only ${this.stock} available, requested ${params.requestedQuantity}`
        );
      }

      // Deduct inventory via append-only movement
      this.stock -= params.requestedQuantity;
      this.ledgerMovements.push({
        type: "sale",
        quantity: -params.requestedQuantity,
      });

      const invoiceNumber = `INV-DHK-${params.transactionId}`;
      this.completedSales.push(invoiceNumber);

      return {
        success: true,
        invoiceNumber,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      return {
        success: false,
        error: message,
      };
    } finally {
      unlock();
    }
  }

  getStockOnHand(): number {
    return this.stock;
  }
}

describe("POS Concurrency & Anti-Overselling Guard", () => {
  it("guarantees that when 2 simultaneous sales request the last remaining unit, exactly ONE succeeds and overselling is impossible", async () => {
    // Exactly 1 unit remaining in stock
    const engine = new ConcurrentInventoryEngine(1);

    // Launch 2 simultaneous sale checkout requests for that 1 unit
    const [result1, result2] = await Promise.all([
      engine.processSaleTransaction({
        transactionId: "TX1",
        requestedQuantity: 1,
      }),
      engine.processSaleTransaction({
        transactionId: "TX2",
        requestedQuantity: 1,
      }),
    ]);

    // Exactly one must succeed
    const successfulSales = [result1, result2].filter((r) => r.success);
    const failedSales = [result1, result2].filter((r) => !r.success);

    expect(successfulSales).toHaveLength(1);
    expect(failedSales).toHaveLength(1);

    // The failed transaction must clearly state INSUFFICIENT_STOCK
    expect(failedSales[0].error).toContain("INSUFFICIENT_STOCK");

    // Stock on hand must be exactly 0 (never negative)
    expect(engine.getStockOnHand()).toBe(0);

    // Ledger movements must have recorded exactly one sale of -1 unit
    expect(engine.ledgerMovements).toHaveLength(1);
    expect(engine.ledgerMovements[0].quantity).toBe(-1);
    expect(engine.completedSales).toHaveLength(1);
  });

  it("handles high-concurrency race conditions (10 concurrent requests for 3 units)", async () => {
    // 3 units in stock
    const engine = new ConcurrentInventoryEngine(3);

    // 10 concurrent requests for 1 unit each
    const requests = Array.from({ length: 10 }, (_, i) =>
      engine.processSaleTransaction({
        transactionId: `TX_${i + 1}`,
        requestedQuantity: 1,
      })
    );

    const results = await Promise.all(requests);

    const successfulSales = results.filter((r) => r.success);
    const failedSales = results.filter((r) => !r.success);

    // Exactly 3 succeed, exactly 7 fail
    expect(successfulSales).toHaveLength(3);
    expect(failedSales).toHaveLength(7);

    // Final stock on hand is 0
    expect(engine.getStockOnHand()).toBe(0);

    // Ledger movements exactly match: 3 * -1 = -3
    const totalDeducted = engine.ledgerMovements.reduce((acc, m) => acc + m.quantity, 0);
    expect(totalDeducted).toBe(-3);
  });
});
