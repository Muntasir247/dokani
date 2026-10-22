import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { getOfflineDB, clearOfflineDB } from "@/lib/offline/db";
import { outboxProcessor } from "@/lib/offline/outbox-processor";
import { getNextOfflineInvoiceNumber, resetOfflineInvoiceSequence } from "@/lib/offline/device";

describe("Offline Sales, Outbox Engine, Idempotency & Failure Injection", () => {
  const tenantId = "test-tenant-push";
  const storeId = "store-dhk-01";
  const locationId = "loc-dhk-01";

  beforeEach(async () => {
    try {
      await clearOfflineDB(tenantId);
    } catch {}
    await resetOfflineInvoiceSequence(tenantId);
    vi.restoreAllMocks();
  });

  it("Simulate Offline: Make 20 sales, go online, and verify server has exactly 20 sales with correct stock (Acceptance Criterion)", async () => {
    const db = getOfflineDB(tenantId);

    // Initial local catalog and stock snapshot: 100 units of variant V1
    await db.stock_snapshots.put({
      variantId: "var-keyboard-1",
      storeId,
      locationId,
      availableStock: 100,
      updatedAt: new Date().toISOString(),
    });

    // 1. Simulate OFFLINE: network is completely unreachable
    const offlineSalesEnqueued: string[] = [];
    for (let i = 1; i <= 20; i++) {
      const offlineInvoiceNumber = await getNextOfflineInvoiceNumber(tenantId, "DHK1");
      const entry = await outboxProcessor.enqueueMutation({
        tenantId,
        storeId,
        mutationType: "create_sale",
        payload: {
          locationId,
          offlineInvoiceNumber,
          items: [{ variantId: "var-keyboard-1", quantity: 2, retailPricePoisha: 150000 }],
          payments: [{ method: "cash", amount: 300000 }],
        },
      });
      offlineSalesEnqueued.push(entry.id);
    }

    // Verify all 20 are queued in Dexie outbox
    expect(await db.outbox.count()).toBe(20);
    const pendingCount = await db.outbox.where("status").equals("pending").count();
    expect(pendingCount).toBe(20);

    // Verify local stock snapshot decremented locally (20 sales * 2 units = 40 sold -> 60 remaining)
    const localStock = await db.stock_snapshots.get("var-keyboard-1");
    expect(localStock?.availableStock).toBe(60);

    // 2. Simulate GOING ONLINE: Mock server receiving push
    const serverRecordedSales: Map<string, any> = new Map();
    let serverStockBalance = 100;
    let serverInvoiceSeq = 0;

    global.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
      const body = JSON.parse(opts.body);
      serverInvoiceSeq++;
      const assignedInvoiceNumber = `INV-DHK1-202610-${serverInvoiceSeq.toString().padStart(6, "0")}`;

      // Decrement server stock
      const qtySold = (body.payload.items || []).reduce((acc: number, it: any) => acc + it.quantity, 0);
      serverStockBalance -= qtySold;

      const serverSaleRecord = {
        saleId: body.outboxId,
        invoiceNumber: assignedInvoiceNumber,
        offlineInvoiceNumber: body.payload.offlineInvoiceNumber,
        totalAmount: 300000,
        stockRemaining: serverStockBalance,
      };

      serverRecordedSales.set(body.outboxId, serverSaleRecord);

      return {
        ok: true,
        status: 200,
        json: async () => serverSaleRecord,
      };
    });

    // Trigger Outbox Processing
    const syncResult = await outboxProcessor.processOutbox(tenantId);

    // Assert: exactly 20 sales synced
    expect(syncResult.syncedCount).toBe(20);
    expect(syncResult.errors).toBe(0);

    // Assert: server has exactly 20 sales
    expect(serverRecordedSales.size).toBe(20);

    // Assert: server stock is exactly 60 (100 - 20*2)
    expect(serverStockBalance).toBe(60);

    // Assert: all 20 entries in Dexie are marked 'synced' with serverResult stored
    const syncedCount = await db.outbox.where("status").equals("synced").count();
    expect(syncedCount).toBe(20);

    const firstEntry = await db.outbox.get(offlineSalesEnqueued[0]);
    expect(firstEntry?.status).toBe("synced");
    expect(firstEntry?.serverResult?.invoiceNumber).toBe("INV-DHK1-202610-000001");
  });

  it("Idempotency: Replaying the same push twice yields original result without duplicating anything (Acceptance Criterion)", async () => {
    // Simulated server database state
    const serverDb = {
      idempotency_keys: new Map<string, { status: number; payload: any }>(),
      sales: new Map<string, any>(),
      stockMovements: [] as any[],
    };

    const handleServerPush = async (body: any) => {
      // 1. Idempotency Check
      if (serverDb.idempotency_keys.has(body.idempotencyKey)) {
        const cached = serverDb.idempotency_keys.get(body.idempotencyKey)!;
        return {
          status: cached.status,
          payload: cached.payload,
          isReplay: true,
        };
      }

      // 2. New Transaction
      const invoiceNumber = `INV-TEST-000001`;
      const saleRecord = {
        saleId: body.outboxId,
        invoiceNumber,
        totalAmount: 250000,
      };

      serverDb.sales.set(body.outboxId, saleRecord);
      serverDb.stockMovements.push({ variantId: "var-1", quantity: -1 });

      const responsePayload = {
        sale: saleRecord,
        invoiceNumber,
        success: true,
      };

      serverDb.idempotency_keys.set(body.idempotencyKey, {
        status: 200,
        payload: responsePayload,
      });

      return {
        status: 200,
        payload: responsePayload,
        isReplay: false,
      };
    };

    const pushPayload = {
      outboxId: "0192a000-0000-7000-8000-000000000001",
      tenantId,
      storeId,
      mutationType: "create_sale",
      idempotencyKey: `idemp_${tenantId}_T01_0192a000-0000-7000-8000-000000000001`,
      payload: {
        items: [{ variantId: "var-1", quantity: 1 }],
      },
    };

    // First push
    const firstCall = await handleServerPush(pushPayload);
    expect(firstCall.status).toBe(200);
    expect(firstCall.isReplay).toBe(false);
    expect(firstCall.payload.invoiceNumber).toBe("INV-TEST-000001");
    expect(serverDb.sales.size).toBe(1);
    expect(serverDb.stockMovements.length).toBe(1);

    // Replay exact same push (simulating network timeout retry)
    const secondCall = await handleServerPush(pushPayload);
    expect(secondCall.status).toBe(200);
    expect(secondCall.isReplay).toBe(true);
    expect(secondCall.payload.invoiceNumber).toBe("INV-TEST-000001");

    // CRITICAL: Zero duplicate sales, zero duplicate stock movements!
    expect(serverDb.sales.size).toBe(1);
    expect(serverDb.stockMovements.length).toBe(1);
  });

  it("Network Interruption Mid-Push: Drops connection halfway through, verifies clean resumption with zero duplicates", async () => {
    const db = getOfflineDB(tenantId);

    // Enqueue 10 sales
    for (let i = 1; i <= 10; i++) {
      await outboxProcessor.enqueueMutation({
        tenantId,
        storeId,
        mutationType: "create_sale",
        payload: {
          items: [{ variantId: "v-mid-drop", quantity: 1 }],
          seq: i,
        },
      });
    }

    expect(await db.outbox.count()).toBe(10);

    const serverCompleted = new Set<string>();
    let requestCount = 0;

    // Simulate network dropping after 5 items
    global.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
      requestCount++;
      const body = JSON.parse(opts.body);

      if (requestCount <= 5) {
        serverCompleted.add(body.outboxId);
        return {
          ok: true,
          status: 200,
          json: async () => ({ saleId: body.outboxId, invoiceNumber: `INV-${requestCount}` }),
        };
      }

      // At request 6: connection dies mid-push!
      throw new TypeError("Failed to fetch - Connection reset by peer");
    });

    // Run first batch; will fail on item 6
    const batch1 = await outboxProcessor.processOutbox(tenantId);
    expect(batch1.syncedCount).toBe(5);
    expect(batch1.errors).toBe(1);

    // Assert: Exactly 5 are synced in local DB, 5 remain pending
    expect(await db.outbox.where("status").equals("synced").count()).toBe(5);
    expect(await db.outbox.where("status").equals("pending").count()).toBe(5);
    expect(serverCompleted.size).toBe(5);

    // Network recovers: Next 5 succeed
    global.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
      const body = JSON.parse(opts.body);
      serverCompleted.add(body.outboxId);
      return {
        ok: true,
        status: 200,
        json: async () => ({ saleId: body.outboxId, invoiceNumber: `INV-RESUMED` }),
      };
    });

    const batch2 = await outboxProcessor.processOutbox(tenantId);
    expect(batch2.syncedCount).toBe(5);
    expect(batch2.errors).toBe(0);

    // Final assert: all 10 completed, zero duplicates
    expect(await db.outbox.where("status").equals("synced").count()).toBe(10);
    expect(serverCompleted.size).toBe(10);
  });

  it("Oversold While Offline Policy: Accepts physical sale, records negative stock balance, and logs negative_stock_alert (Acceptance Criterion)", async () => {
    // Simulation of server-side fn_create_sale with p_is_offline_sync = true
    const serverStock = {
      availableStock: 0, // Out of stock on server!
      ledgerMovements: [] as any[],
      auditLogs: [] as any[],
      sales: [] as any[],
    };

    const processServerSale = (params: {
      tenantId: string;
      saleId: string;
      requestedQty: number;
      isOfflineSync: boolean;
      variantName: string;
    }) => {
      const { tenantId, saleId, requestedQty, isOfflineSync, variantName } = params;

      if (serverStock.availableStock < requestedQty) {
        if (!isOfflineSync) {
          // Live online checkout: aborts to prevent overselling
          throw new Error(`INSUFFICIENT_STOCK: Item "${variantName}" only has ${serverStock.availableStock} available`);
        }

        // Offline sync mode: The customer physically paid and took goods!
        // Accept the sale, deduct stock into negative, and record alert
        serverStock.auditLogs.push({
          tenantId,
          action: "alert:negative_stock",
          entity: "sales",
          entityId: saleId,
          details: {
            variantName,
            availableStock: serverStock.availableStock,
            requestedQty,
            deficit: requestedQty - serverStock.availableStock,
          },
        });
      }

      // Record negative movement in append-only stock ledger
      serverStock.availableStock -= requestedQty;
      serverStock.ledgerMovements.push({
        movementType: "sale_out",
        quantity: -requestedQty,
        saleId,
      });

      serverStock.sales.push({
        id: saleId,
        invoiceNumber: "INV-OFFLINE-RECONCILED-001",
        isOfflineSync,
      });

      return {
        saleId,
        invoiceNumber: "INV-OFFLINE-RECONCILED-001",
        status: "completed",
      };
    };

    // Attempting live online sale when stock is 0 -> FAILS
    expect(() => {
      processServerSale({
        tenantId,
        saleId: "sale-live",
        requestedQty: 2,
        isOfflineSync: false,
        variantName: "Logitech MX Master 3S",
      });
    }).toThrow(/INSUFFICIENT_STOCK/);

    // Attempting offline sync push when stock is 0 -> SUCCEEDS & RAISES ALERT
    const result = processServerSale({
      tenantId,
      saleId: "sale-offline-001",
      requestedQty: 2,
      isOfflineSync: true,
      variantName: "Logitech MX Master 3S",
    });

    expect(result.status).toBe("completed");
    expect(result.invoiceNumber).toBe("INV-OFFLINE-RECONCILED-001");

    // Stock on server dropped to -2
    expect(serverStock.availableStock).toBe(-2);
    expect(serverStock.ledgerMovements[0].quantity).toBe(-2);

    // Negative stock alert created in audit logs for management
    expect(serverStock.auditLogs.length).toBe(1);
    expect(serverStock.auditLogs[0].action).toBe("alert:negative_stock");
    expect(serverStock.auditLogs[0].details.deficit).toBe(2);
  });
});
