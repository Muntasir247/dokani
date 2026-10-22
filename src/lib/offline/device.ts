import { getOfflineDB } from "./db";

export interface TerminalDeviceInfo {
  deviceCode: string;
  deviceName: string;
  storeCode: string;
}

const DEFAULT_STORE_CODE = "MAIN";

export async function getOrCreateDeviceInfo(
  tenantId: string,
  preferredStoreCode?: string
): Promise<TerminalDeviceInfo> {
  const db = getOfflineDB(tenantId);

  // Check sync_meta first
  const metaCode = await db.sync_meta.get("device_code");
  const metaName = await db.sync_meta.get("device_name");
  const metaStore = await db.sync_meta.get("store_code");

  let deviceCode = metaCode?.value as string | undefined;
  let deviceName = metaName?.value as string | undefined;
  const storeCode = (metaStore?.value as string | undefined) || preferredStoreCode || DEFAULT_STORE_CODE;

  if (!deviceCode) {
    // Generate terminal identifier (e.g., T01, T02 or short hex)
    const randomSuffix = Math.floor(10 + Math.random() * 90);
    deviceCode = `T${randomSuffix}`;
    deviceName = `Counter Terminal ${deviceCode}`;

    await db.sync_meta.put({ key: "device_code", value: deviceCode });
    await db.sync_meta.put({ key: "device_name", value: deviceName });
  }

  if (preferredStoreCode && preferredStoreCode !== metaStore?.value) {
    await db.sync_meta.put({ key: "store_code", value: preferredStoreCode });
  }

  return {
    deviceCode,
    deviceName: deviceName || `Counter Terminal ${deviceCode}`,
    storeCode,
  };
}

export async function getNextOfflineInvoiceNumber(
  tenantId: string,
  storeCode?: string
): Promise<string> {
  const db = getOfflineDB(tenantId);
  const info = await getOrCreateDeviceInfo(tenantId, storeCode);

  // Monotonically increment local sequence in sync_meta
  let nextSeq = 1;
  const seqRecord = await db.sync_meta.get("offline_invoice_seq");
  if (seqRecord && typeof seqRecord.value === "number") {
    nextSeq = seqRecord.value + 1;
  }

  await db.sync_meta.put({ key: "offline_invoice_seq", value: nextSeq });

  const paddedSeq = nextSeq.toString().padStart(6, "0");
  return `OFF-${info.storeCode}-${info.deviceCode}-${paddedSeq}`;
}

export async function resetOfflineInvoiceSequence(tenantId: string): Promise<void> {
  const db = getOfflineDB(tenantId);
  await db.sync_meta.put({ key: "offline_invoice_seq", value: 0 });
}
