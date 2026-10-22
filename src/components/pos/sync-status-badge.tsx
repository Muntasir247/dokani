"use client";

import React, { useEffect, useState } from "react";
import {
  outboxProcessor,
  SyncStateSnapshot,
} from "@/lib/offline/outbox-processor";
import { pullDeltaSync } from "@/lib/offline/sync-puller";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface SyncStatusBadgeProps {
  tenantId: string;
  storeId?: string;
  onSyncComplete?: () => void;
}

export function SyncStatusBadge({ tenantId, storeId, onSyncComplete }: SyncStatusBadgeProps) {
  const [syncState, setSyncState] = useState<SyncStateSnapshot>({
    status: typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline",
    pendingCount: 0,
    lastSyncedAt: null,
    lastError: null,
  });
  const [isPulling, setIsPulling] = useState(false);

  useEffect(() => {
    if (!tenantId) return;

    outboxProcessor.init(tenantId);
    const unsubscribe = outboxProcessor.subscribe((state) => {
      setSyncState(state);
    });

    return () => {
      unsubscribe();
    };
  }, [tenantId]);

  const handleManualSync = async () => {
    if (!tenantId || isPulling) return;
    setIsPulling(true);

    try {
      // 1. Push any pending outbox items
      await outboxProcessor.processOutbox(tenantId);
      // 2. Pull latest deltas from server
      await pullDeltaSync(tenantId, storeId);
      onSyncComplete?.();
    } catch (err) {
      console.warn("Manual sync error:", err);
    } finally {
      setIsPulling(false);
    }
  };

  const isSyncing = syncState.status === "syncing" || isPulling;

  if (syncState.status === "offline") {
    return (
      <button
        type="button"
        onClick={handleManualSync}
        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 transition shadow-xs"
        title="Offline Mode: Sales are safely saved locally and will auto-sync when reconnected"
      >
        <WifiOff className="h-3.5 w-3.5 text-amber-600" />
        <span>Offline</span>
        {syncState.pendingCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-black text-white">
            {syncState.pendingCount}
          </span>
        )}
      </button>
    );
  }

  if (syncState.status === "error") {
    return (
      <button
        type="button"
        onClick={handleManualSync}
        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-xs"
        title={`Sync Error: ${syncState.lastError || "Failed to push"}. Click to retry.`}
      >
        <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
        <span>Sync Error</span>
        {syncState.pendingCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">
            {syncState.pendingCount}
          </span>
        )}
      </button>
    );
  }

  if (isSyncing) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 shadow-xs">
        <RefreshCw className="h-3.5 w-3.5 text-blue-600 animate-spin" />
        <span>Syncing...</span>
        {syncState.pendingCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-black text-white">
            {syncState.pendingCount}
          </span>
        )}
      </div>
    );
  }

  // Online & Synced
  return (
    <button
      type="button"
      onClick={handleManualSync}
      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition shadow-xs"
      title="Terminal is online and fully synchronized. Click to pull fresh catalog updates."
    >
      <Wifi className="h-3.5 w-3.5 text-emerald-600" />
      <span className="font-bold">Online</span>
      {syncState.pendingCount > 0 ? (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-white">
          {syncState.pendingCount}
        </span>
      ) : (
        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
      )}
    </button>
  );
}
