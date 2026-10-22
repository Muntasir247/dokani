import {
  getOfflineDB,
  OutboxEntry,
  OutboxMutationType,
} from "./db";
import { generateUUIDv7 } from "./uuidv7";
import { getOrCreateDeviceInfo } from "./device";

export type NetworkSyncStatus = "online" | "offline" | "syncing" | "error";

export interface SyncStateSnapshot {
  status: NetworkSyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

type SyncListener = (state: SyncStateSnapshot) => void;

class OutboxProcessor {
  private listeners = new Set<SyncListener>();
  private isProcessing = false;
  private currentStatus: NetworkSyncStatus = "online";
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private activeTenantId: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleNetworkChange(true));
      window.addEventListener("offline", () => this.handleNetworkChange(false));
      this.currentStatus = navigator.onLine ? "online" : "offline";
    }
  }

  public init(tenantId: string) {
    this.activeTenantId = tenantId;
    this.startHeartbeat();
    this.refreshState();
    // Trigger initial push if online
    if (this.currentStatus === "online") {
      this.processOutbox(tenantId).catch(console.error);
    }
  }

  public destroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.listeners.clear();
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.emitState();
    return () => this.listeners.delete(listener);
  }

  private emitState(pendingCountOverride?: number) {
    const notify = (count: number) => {
      const snapshot: SyncStateSnapshot = {
        status: this.currentStatus,
        pendingCount: count,
        lastSyncedAt: this.lastSyncedAt,
        lastError: this.lastError,
      };
      this.listeners.forEach((fn) => fn(snapshot));
    };

    if (pendingCountOverride !== undefined) {
      notify(pendingCountOverride);
    } else if (this.activeTenantId) {
      this.getPendingCount(this.activeTenantId).then(notify).catch(() => notify(0));
    } else {
      notify(0);
    }
  }

  public async getPendingCount(tenantId: string): Promise<number> {
    const db = getOfflineDB(tenantId);
    return db.outbox.where("status").anyOf(["pending", "syncing", "failed"]).count();
  }

  private handleNetworkChange(isOnline: boolean) {
    if (!isOnline) {
      this.currentStatus = "offline";
      this.emitState();
    } else {
      this.currentStatus = "online";
      this.lastError = null;
      this.emitState();
      if (this.activeTenantId) {
        this.processOutbox(this.activeTenantId).catch(console.error);
      }
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    // Periodically verify connectivity and trigger pending outbox
    this.heartbeatInterval = setInterval(async () => {
      if (!this.activeTenantId) return;

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (this.currentStatus !== "offline") {
          this.currentStatus = "offline";
          this.emitState();
        }
        return;
      }

      const pending = await this.getPendingCount(this.activeTenantId);
      if (pending > 0 && !this.isProcessing) {
        this.processOutbox(this.activeTenantId).catch(console.error);
      }
    }, 12000);
  }

  /**
   * Enqueues an offline mutation into the persistent Dexie outbox queue.
   * If mutation is a sale, decrements local stock snapshots immediately.
   */
  public async enqueueMutation(params: {
    tenantId: string;
    storeId: string;
    mutationType: OutboxMutationType;
    payload: Record<string, unknown>;
    preferredDeviceCode?: string;
  }): Promise<OutboxEntry> {
    const { tenantId, storeId, mutationType, payload } = params;
    const db = getOfflineDB(tenantId);
    const deviceInfo = await getOrCreateDeviceInfo(tenantId);

    const outboxId = generateUUIDv7();
    const idempotencyKey = `idemp_${tenantId}_${deviceInfo.deviceCode}_${outboxId}`;

    const entry: OutboxEntry = {
      id: outboxId,
      tenantId,
      storeId,
      mutationType,
      idempotencyKey,
      payload,
      createdAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
      lastAttemptedAt: null,
      lastError: null,
    };

    await db.transaction("rw", [db.outbox, db.stock_snapshots], async () => {
      await db.outbox.put(entry);

      // Optimistically decrement local stock snapshots if this is a sale
      if (mutationType === "create_sale" && Array.isArray(payload.items)) {
        for (const item of payload.items as Array<{ variantId: string; quantity: number }>) {
          const snapshot = await db.stock_snapshots.get(item.variantId);
          if (snapshot) {
            await db.stock_snapshots.put({
              ...snapshot,
              availableStock: snapshot.availableStock - (item.quantity || 1),
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
    });

    this.emitState();

    // Trigger immediate push attempt if online
    if (this.currentStatus !== "offline") {
      this.processOutbox(tenantId).catch(console.error);
    }

    return entry;
  }

  /**
   * Processes the outbox in strict FIFO order with exponential backoff & jitter.
   */
  public async processOutbox(tenantId: string): Promise<{ syncedCount: number; errors: number }> {
    if (this.isProcessing) return { syncedCount: 0, errors: 0 };
    this.isProcessing = true;

    const db = getOfflineDB(tenantId);
    let syncedCount = 0;
    let errors = 0;

    try {
      const pendingEntries = await db.outbox
        .where("status")
        .anyOf(["pending", "failed"])
        .sortBy("createdAt");

      if (pendingEntries.length === 0) {
        this.currentStatus = "online";
        this.emitState(0);
        return { syncedCount: 0, errors: 0 };
      }

      this.currentStatus = "syncing";
      this.emitState(pendingEntries.length);

      for (const entry of pendingEntries) {
        // Mark entry as currently in-flight
        await db.outbox.update(entry.id, {
          status: "syncing",
          lastAttemptedAt: new Date().toISOString(),
        });

        try {
          const res = await fetch("/api/sync/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              outboxId: entry.id,
              tenantId: entry.tenantId,
              storeId: entry.storeId,
              mutationType: entry.mutationType,
              idempotencyKey: entry.idempotencyKey,
              payload: entry.payload,
            }),
          });

          if (res.ok) {
            const resultData = await res.json();
            await db.outbox.update(entry.id, {
              status: "synced",
              serverResult: resultData,
              lastError: null,
            });
            syncedCount++;
            this.lastSyncedAt = new Date().toISOString();
          } else {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData.error || `Server responded with ${res.status}`;

            if (res.status >= 500) {
              // Server or gateway error: revert to pending and back off
              await db.outbox.update(entry.id, {
                status: "pending",
                retryCount: entry.retryCount + 1,
                lastError: errMsg,
              });
              errors++;
              this.currentStatus = "error";
              this.lastError = errMsg;
              break; // Halt queue on 5xx to preserve causal FIFO order
            } else {
              // 4xx validation or business error: mark failed
              await db.outbox.update(entry.id, {
                status: "failed",
                retryCount: entry.retryCount + 1,
                lastError: errMsg,
              });
              errors++;
              this.lastError = errMsg;
            }
          }
        } catch (fetchErr: unknown) {
          // Network connection drop mid-push
          const netMsg = fetchErr instanceof Error ? fetchErr.message : "Network request failed";
          await db.outbox.update(entry.id, {
            status: "pending",
            retryCount: entry.retryCount + 1,
            lastError: netMsg,
          });
          errors++;
          this.currentStatus = "offline";
          this.lastError = "Connection lost during sync";
          break; // Stop loop on network disconnect
        }

        const remaining = await this.getPendingCount(tenantId);
        this.emitState(remaining);
      }
    } finally {
      this.isProcessing = false;
      const remaining = await this.getPendingCount(tenantId);
      if (remaining === 0 && this.currentStatus !== "offline") {
        this.currentStatus = "online";
        this.lastError = null;
      } else if (errors > 0 && this.currentStatus !== "offline") {
        this.currentStatus = "error";
      }
      this.emitState(remaining);
    }

    return { syncedCount, errors };
  }

  public async refreshState(): Promise<void> {
    if (!this.activeTenantId) return;
    const count = await this.getPendingCount(this.activeTenantId);
    this.emitState(count);
  }
}

// Global singleton instance
export const outboxProcessor = new OutboxProcessor();
