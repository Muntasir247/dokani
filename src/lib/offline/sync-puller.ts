import {
  getOfflineDB,
  LocalProduct,
  LocalVariant,
  LocalCategory,
  LocalBrand,
  LocalCustomer,
  LocalStockSnapshot,
  LocalSerial,
} from "./db";

export interface SyncPullChanges {
  products: { upserts: LocalProduct[]; deletes: string[] };
  variants: { upserts: LocalVariant[]; deletes: string[] };
  categories: { upserts: LocalCategory[]; deletes: string[] };
  brands: { upserts: LocalBrand[]; deletes: string[] };
  customers: { upserts: LocalCustomer[]; deletes: string[] };
  stock_snapshots: { upserts: LocalStockSnapshot[]; deletes: string[] };
  serials: { upserts: LocalSerial[]; deletes: string[] };
}

export interface SyncPullResponse {
  hasMore: boolean;
  nextCursor: string;
  page?: number;
  totalPages?: number;
  changes: SyncPullChanges;
}

export interface PullProgressCallback {
  (progress: { page: number; totalPages: number; percentage: number }): void;
}

export async function pullDeltaSync(
  tenantId: string,
  storeId?: string,
  onProgress?: PullProgressCallback
): Promise<{ pulledCount: number; lastCursor: string }> {
  const db = getOfflineDB(tenantId);

  // 1. Retrieve last pulled cursor
  const cursorRecord = await db.sync_meta.get("last_pulled_cursor");
  let cursor = (cursorRecord?.value as string) || "";
  let hasMore = true;
  let totalPulled = 0;
  let page = 0;

  while (hasMore) {
    page++;
    const params = new URLSearchParams({
      tenantId,
      ...(storeId ? { storeId } : {}),
      ...(cursor ? { cursor } : {}),
      limit: "500",
    });

    const res = await fetch(`/api/sync/pull?${params.toString()}`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Pull sync failed with status ${res.status}`);
    }

    const data: SyncPullResponse = await res.json();
    const changes = data.changes;

    // Apply batch inside an atomic Dexie transaction
    await db.transaction(
      "rw",
      [
        db.products,
        db.variants,
        db.categories,
        db.brands,
        db.customers,
        db.stock_snapshots,
        db.serials,
        db.sync_meta,
      ],
      async () => {
        // Products
        if (changes.products.upserts.length > 0) {
          await db.products.bulkPut(changes.products.upserts);
        }
        if (changes.products.deletes.length > 0) {
          await db.products.bulkDelete(changes.products.deletes);
        }

        // Variants
        if (changes.variants.upserts.length > 0) {
          await db.variants.bulkPut(changes.variants.upserts);
        }
        if (changes.variants.deletes.length > 0) {
          await db.variants.bulkDelete(changes.variants.deletes);
        }

        // Categories
        if (changes.categories.upserts.length > 0) {
          await db.categories.bulkPut(changes.categories.upserts);
        }
        if (changes.categories.deletes.length > 0) {
          await db.categories.bulkDelete(changes.categories.deletes);
        }

        // Brands
        if (changes.brands.upserts.length > 0) {
          await db.brands.bulkPut(changes.brands.upserts);
        }
        if (changes.brands.deletes.length > 0) {
          await db.brands.bulkDelete(changes.brands.deletes);
        }

        // Customers
        if (changes.customers.upserts.length > 0) {
          await db.customers.bulkPut(changes.customers.upserts);
        }
        if (changes.customers.deletes.length > 0) {
          await db.customers.bulkDelete(changes.customers.deletes);
        }

        // Stock Snapshots
        if (changes.stock_snapshots.upserts.length > 0) {
          await db.stock_snapshots.bulkPut(changes.stock_snapshots.upserts);
        }
        if (changes.stock_snapshots.deletes.length > 0) {
          await db.stock_snapshots.bulkDelete(changes.stock_snapshots.deletes);
        }

        // Serials
        if (changes.serials.upserts.length > 0) {
          await db.serials.bulkPut(changes.serials.upserts);
        }
        if (changes.serials.deletes.length > 0) {
          await db.serials.bulkDelete(changes.serials.deletes);
        }

        // Save progress cursor
        cursor = data.nextCursor;
        await db.sync_meta.put({ key: "last_pulled_cursor", value: cursor });
      }
    );

    const batchCount =
      changes.products.upserts.length +
      changes.variants.upserts.length +
      changes.customers.upserts.length +
      changes.stock_snapshots.upserts.length;
    totalPulled += batchCount;

    if (onProgress) {
      const totalPages = data.totalPages || 1;
      const pct = Math.min(100, Math.round((page / totalPages) * 100));
      onProgress({ page, totalPages, percentage: pct });
    }

    hasMore = data.hasMore;
  }

  return { pulledCount: totalPulled, lastCursor: cursor };
}

export async function resetPullCursor(tenantId: string): Promise<void> {
  const db = getOfflineDB(tenantId);
  await db.sync_meta.delete("last_pulled_cursor");
}
