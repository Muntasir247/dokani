import Dexie, { Table } from "dexie";

export interface LocalProduct {
  id: string;
  tenantId: string;
  categoryId: string | null;
  brandId: string | null;
  name: string;
  unit: string;
  hasVariants: boolean;
  hasSerials: boolean;
  warrantyMonths: number;
  version: number;
  updatedAt: string;
}

export interface LocalVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  barcode: string | null;
  retailPrice: number; // poisha
  costPrice: number | null; // poisha
  taxRate: number; // basis points
  currentStock: number;
  version: number;
  updatedAt: string;
}

export interface LocalCategory {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  version: number;
  updatedAt: string;
}

export interface LocalBrand {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  updatedAt: string;
}

export interface LocalCustomer {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string | null;
  currentDue: number; // poisha
  creditLimit: number; // poisha
  version: number;
  updatedAt: string;
}

export interface LocalStockSnapshot {
  variantId: string;
  storeId: string;
  locationId: string;
  availableStock: number;
  updatedAt: string;
}

export interface LocalSerial {
  id: string;
  variantId: string;
  serialNumber: string;
  status: "available" | "reserved" | "sold" | "returned" | "rma";
  updatedAt: string;
}

export type OutboxStatus = "pending" | "syncing" | "synced" | "failed";
export type OutboxMutationType = "create_sale" | "create_customer" | "return_sale" | "void_sale";

export interface OutboxEntry {
  id: string; // UUID v7
  tenantId: string;
  storeId: string;
  mutationType: OutboxMutationType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  createdAt: string; // ISO timestamp
  status: OutboxStatus;
  retryCount: number;
  lastAttemptedAt: string | null;
  lastError: string | null;
  serverResult?: Record<string, unknown>;
}

export interface SyncMetaEntry {
  key: string;
  value: unknown;
}

export class DokaniOfflineDB extends Dexie {
  products!: Table<LocalProduct, string>;
  variants!: Table<LocalVariant, string>;
  categories!: Table<LocalCategory, string>;
  brands!: Table<LocalBrand, string>;
  customers!: Table<LocalCustomer, string>;
  stock_snapshots!: Table<LocalStockSnapshot, string>;
  serials!: Table<LocalSerial, string>;
  outbox!: Table<OutboxEntry, string>;
  sync_meta!: Table<SyncMetaEntry, string>;

  constructor(tenantId: string) {
    super(`dokani_${tenantId}`);

    this.version(1).stores({
      products: "id, tenantId, categoryId, brandId, name, updatedAt",
      variants: "id, productId, sku, barcode, retailPrice, updatedAt",
      categories: "id, tenantId, name",
      brands: "id, tenantId, name",
      customers: "id, tenantId, phone, name, updatedAt",
      stock_snapshots: "variantId, storeId, locationId, updatedAt",
      serials: "id, variantId, serialNumber, status, updatedAt",
      outbox: "id, tenantId, mutationType, status, createdAt, [tenantId+status]",
      sync_meta: "key",
    });
  }
}

// Instance cache map keyed by tenantId
const dbInstances = new Map<string, DokaniOfflineDB>();

export function getOfflineDB(tenantId: string): DokaniOfflineDB {
  if (!tenantId) {
    throw new Error("Cannot initialize offline database: tenantId is required");
  }

  let db = dbInstances.get(tenantId);
  if (!db) {
    db = new DokaniOfflineDB(tenantId);
    dbInstances.set(tenantId, db);
  }
  return db;
}

export async function closeOfflineDB(tenantId: string): Promise<void> {
  const db = dbInstances.get(tenantId);
  if (db) {
    db.close();
    dbInstances.delete(tenantId);
  }
}

export async function clearOfflineDB(tenantId: string): Promise<void> {
  await closeOfflineDB(tenantId);
  await Dexie.delete(`dokani_${tenantId}`);
}

export async function hasUnsyncedOutbox(tenantId: string): Promise<boolean> {
  const db = getOfflineDB(tenantId);
  const count = await db.outbox
    .where("status")
    .anyOf(["pending", "syncing", "failed"])
    .count();
  return count > 0;
}
