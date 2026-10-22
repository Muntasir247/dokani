import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  getOfflineDB,
  clearOfflineDB,
  hasUnsyncedOutbox,
  LocalProduct,
  LocalVariant,
} from "@/lib/offline/db";
import { outboxProcessor } from "@/lib/offline/outbox-processor";

describe("Dexie Local Offline Database & Outbox Queue", () => {
  const tenantId = "test-tenant-sync-db";

  beforeEach(async () => {
    try {
      await clearOfflineDB(tenantId);
    } catch {}
  });

  it("stores and indexes local catalog products and variants", async () => {
    const db = getOfflineDB(tenantId);

    const product: LocalProduct = {
      id: "prod-1",
      tenantId,
      categoryId: "cat-1",
      brandId: "brand-1",
      name: "Samsung Galaxy A54",
      unit: "pcs",
      hasVariants: true,
      hasSerials: true,
      warrantyMonths: 12,
      version: 1,
      updatedAt: new Date().toISOString(),
    };

    const variant: LocalVariant = {
      id: "var-1",
      productId: "prod-1",
      name: "8GB/128GB - Awesome Lime",
      sku: "SAM-A54-LIME",
      barcode: "8806091873210",
      retailPrice: 4200000, // ৳42,000.00 in poisha
      costPrice: 3800000,
      taxRate: 500, // 5%
      currentStock: 15,
      version: 1,
      updatedAt: new Date().toISOString(),
    };

    await db.products.put(product);
    await db.variants.put(variant);

    // Fast indexed barcode lookup
    const foundByBarcode = await db.variants.where("barcode").equals("8806091873210").first();
    expect(foundByBarcode).toBeDefined();
    expect(foundByBarcode?.id).toBe("var-1");
    expect(foundByBarcode?.sku).toBe("SAM-A54-LIME");

    // SKU lookup
    const foundBySku = await db.variants.where("sku").equals("SAM-A54-LIME").first();
    expect(foundBySku?.retailPrice).toBe(4200000);
  });

  it("decrements local stock snapshot immediately when a sale is enqueued", async () => {
    const db = getOfflineDB(tenantId);

    // Initial stock snapshot
    await db.stock_snapshots.put({
      variantId: "var-laptop-1",
      storeId: "store-main",
      locationId: "loc-main",
      availableStock: 5,
      updatedAt: new Date().toISOString(),
    });

    // Enqueue an offline sale of 2 units
    await outboxProcessor.enqueueMutation({
      tenantId,
      storeId: "store-main",
      mutationType: "create_sale",
      payload: {
        locationId: "loc-main",
        items: [{ variantId: "var-laptop-1", quantity: 2 }],
      },
    });

    const updatedSnapshot = await db.stock_snapshots.get("var-laptop-1");
    expect(updatedSnapshot?.availableStock).toBe(3);

    // Enqueue another sale of 1 unit
    await outboxProcessor.enqueueMutation({
      tenantId,
      storeId: "store-main",
      mutationType: "create_sale",
      payload: {
        locationId: "loc-main",
        items: [{ variantId: "var-laptop-1", quantity: 1 }],
      },
    });

    const finalSnapshot = await db.stock_snapshots.get("var-laptop-1");
    expect(finalSnapshot?.availableStock).toBe(2);
  });

  it("detects unsynced outbox mutations to protect against unannounced logouts", async () => {
    const db = getOfflineDB(tenantId);

    expect(await hasUnsyncedOutbox(tenantId)).toBe(false);

    await outboxProcessor.enqueueMutation({
      tenantId,
      storeId: "store-main",
      mutationType: "create_sale",
      payload: { test: true },
    });

    expect(await hasUnsyncedOutbox(tenantId)).toBe(true);

    // If marked synced, hasUnsyncedOutbox should return false
    const pending = await db.outbox.toCollection().first();
    if (pending) {
      await db.outbox.update(pending.id, { status: "synced" });
    }

    expect(await hasUnsyncedOutbox(tenantId)).toBe(false);
  });

  it("completely sanitizes and purges local storage on logout", async () => {
    const db = getOfflineDB(tenantId);
    await db.products.put({
      id: "p1",
      tenantId,
      categoryId: null,
      brandId: null,
      name: "Secret Item",
      unit: "pcs",
      hasVariants: false,
      hasSerials: false,
      warrantyMonths: 0,
      version: 1,
      updatedAt: new Date().toISOString(),
    });

    expect(await db.products.count()).toBe(1);

    await clearOfflineDB(tenantId);

    const freshDb = getOfflineDB(tenantId);
    expect(await freshDb.products.count()).toBe(0);
  });
});
