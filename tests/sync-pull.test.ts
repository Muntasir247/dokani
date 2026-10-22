import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { getOfflineDB, clearOfflineDB } from "@/lib/offline/db";
import { pullDeltaSync, resetPullCursor } from "@/lib/offline/sync-puller";

describe("Pull Synchronization Engine & Resumability", () => {
  const tenantId = "test-tenant-pull";
  const storeId = "test-store-1";

  beforeEach(async () => {
    try {
      await clearOfflineDB(tenantId);
    } catch {}
    vi.restoreAllMocks();
  });

  it("performs cold start initial sync with progress tracking and applies records", async () => {
    const db = getOfflineDB(tenantId);

    // Mock server returning initial full sync
    const mockResponse = {
      hasMore: false,
      nextCursor: "2026-10-22T08:00:00.000Z",
      page: 1,
      totalPages: 1,
      changes: {
        products: {
          upserts: [
            {
              id: "p-100",
              tenantId,
              categoryId: "cat-1",
              brandId: null,
              name: "Rice 50kg Sack",
              unit: "bag",
              hasVariants: false,
              hasSerials: false,
              warrantyMonths: 0,
              version: 1,
              updatedAt: "2026-10-22T08:00:00.000Z",
            },
          ],
          deletes: [],
        },
        variants: {
          upserts: [
            {
              id: "v-100",
              productId: "p-100",
              name: "50kg Miniket",
              sku: "RICE-MINIKET-50",
              barcode: "8941100234567",
              retailPrice: 380000, // ৳3,800.00
              costPrice: 350000,
              taxRate: 0,
              currentStock: 40,
              version: 1,
              updatedAt: "2026-10-22T08:00:00.000Z",
            },
          ],
          deletes: [],
        },
        categories: {
          upserts: [
            { id: "cat-1", tenantId, name: "Grains", slug: "grains", version: 1, updatedAt: "2026-10-22T08:00:00.000Z" },
          ],
          deletes: [],
        },
        brands: { upserts: [], deletes: [] },
        customers: {
          upserts: [
            { id: "c-1", tenantId, name: "Rahim Traders", phone: "01711223344", email: null, currentDue: 50000, creditLimit: 100000, version: 1, updatedAt: "2026-10-22T08:00:00.000Z" },
          ],
          deletes: [],
        },
        stock_snapshots: {
          upserts: [
            { variantId: "v-100", storeId, locationId: "loc-1", availableStock: 40, updatedAt: "2026-10-22T08:00:00.000Z" },
          ],
          deletes: [],
        },
        serials: { upserts: [], deletes: [] },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const progressLogs: number[] = [];
    const result = await pullDeltaSync(tenantId, storeId, (p) => {
      progressLogs.push(p.percentage);
    });

    expect(result.pulledCount).toBeGreaterThan(0);
    expect(result.lastCursor).toBe("2026-10-22T08:00:00.000Z");
    expect(progressLogs).toContain(100);

    // Verify Dexie state
    expect(await db.products.count()).toBe(1);
    expect(await db.variants.count()).toBe(1);
    expect(await db.customers.count()).toBe(1);
    expect(await db.stock_snapshots.count()).toBe(1);

    const savedCursor = await db.sync_meta.get("last_pulled_cursor");
    expect(savedCursor?.value).toBe("2026-10-22T08:00:00.000Z");
  });

  it("handles tombstones: deletes removed records from local database", async () => {
    const db = getOfflineDB(tenantId);

    // Seed existing local items
    await db.products.put({
      id: "p-todelete",
      tenantId,
      categoryId: null,
      brandId: null,
      name: "Discontinued Product",
      unit: "pcs",
      hasVariants: false,
      hasSerials: false,
      warrantyMonths: 0,
      version: 1,
      updatedAt: "2026-10-22T07:00:00.000Z",
    });

    await db.variants.put({
      id: "v-todelete",
      productId: "p-todelete",
      name: "Old Variant",
      sku: "OLD-SKU",
      barcode: "1111111111111",
      retailPrice: 1000,
      costPrice: 500,
      taxRate: 0,
      currentStock: 0,
      version: 1,
      updatedAt: "2026-10-22T07:00:00.000Z",
    });

    expect(await db.products.count()).toBe(1);
    expect(await db.variants.count()).toBe(1);

    // Delta sync with DELETE tombstones
    const deltaResponse = {
      hasMore: false,
      nextCursor: "2026-10-22T09:00:00.000Z",
      changes: {
        products: { upserts: [], deletes: ["p-todelete"] },
        variants: { upserts: [], deletes: ["v-todelete"] },
        categories: { upserts: [], deletes: [] },
        brands: { upserts: [], deletes: [] },
        customers: { upserts: [], deletes: [] },
        stock_snapshots: { upserts: [], deletes: [] },
        serials: { upserts: [], deletes: [] },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => deltaResponse,
    } as Response);

    await pullDeltaSync(tenantId, storeId);

    // Verify items were deleted locally via tombstones
    expect(await db.products.count()).toBe(0);
    expect(await db.variants.count()).toBe(0);
  });

  it("resumes multi-page sync from saved cursor when interrupted", async () => {
    const db = getOfflineDB(tenantId);
    await resetPullCursor(tenantId);

    // Page 1 succeeds
    const page1 = {
      hasMore: true,
      nextCursor: "2026-10-22T08:30:00.000Z",
      page: 1,
      totalPages: 2,
      changes: {
        products: { upserts: [{ id: "p-page1", tenantId, categoryId: null, brandId: null, name: "P1", unit: "pcs", hasVariants: false, hasSerials: false, warrantyMonths: 0, version: 1, updatedAt: "2026-10-22T08:30:00.000Z" }], deletes: [] },
        variants: { upserts: [], deletes: [] },
        categories: { upserts: [], deletes: [] },
        brands: { upserts: [], deletes: [] },
        customers: { upserts: [], deletes: [] },
        stock_snapshots: { upserts: [], deletes: [] },
        serials: { upserts: [], deletes: [] },
      },
    };

    // Page 2 fails with network disconnect
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: true, json: async () => page1 };
      }
      throw new TypeError("Failed to fetch - Network dropped mid-sync");
    });

    // Run sync; should fail on page 2
    await expect(pullDeltaSync(tenantId, storeId)).rejects.toThrow("Network dropped mid-sync");

    // BUT Page 1 was already committed and cursor was checkpointed!
    expect(await db.products.count()).toBe(1);
    const savedCursor = await db.sync_meta.get("last_pulled_cursor");
    expect(savedCursor?.value).toBe("2026-10-22T08:30:00.000Z");

    // Network recovers, Page 2 succeeds
    const page2 = {
      hasMore: false,
      nextCursor: "2026-10-22T09:00:00.000Z",
      page: 2,
      totalPages: 2,
      changes: {
        products: { upserts: [{ id: "p-page2", tenantId, categoryId: null, brandId: null, name: "P2", unit: "pcs", hasVariants: false, hasSerials: false, warrantyMonths: 0, version: 1, updatedAt: "2026-10-22T09:00:00.000Z" }], deletes: [] },
        variants: { upserts: [], deletes: [] },
        categories: { upserts: [], deletes: [] },
        brands: { upserts: [], deletes: [] },
        customers: { upserts: [], deletes: [] },
        stock_snapshots: { upserts: [], deletes: [] },
        serials: { upserts: [], deletes: [] },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => page2,
    });

    // Resumes cleanly
    await pullDeltaSync(tenantId, storeId);
    expect(await db.products.count()).toBe(2);
    const finalCursor = await db.sync_meta.get("last_pulled_cursor");
    expect(finalCursor?.value).toBe("2026-10-22T09:00:00.000Z");
  });
});
