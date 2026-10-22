import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { getOfflineDB, clearOfflineDB } from "@/lib/offline/db";
import { getOrCreateDeviceInfo, getNextOfflineInvoiceNumber, resetOfflineInvoiceSequence } from "@/lib/offline/device";

describe("Offline Terminal Identification & Sequential Invoicing", () => {
  const tenantId = "test-tenant-123";

  beforeEach(async () => {
    try {
      await clearOfflineDB(tenantId);
    } catch {}
  });

  it("generates deterministic terminal code and persists it in sync_meta", async () => {
    const info1 = await getOrCreateDeviceInfo(tenantId, "DHK1");
    expect(info1.deviceCode).toMatch(/^T\d+$/);
    expect(info1.storeCode).toBe("DHK1");

    // Second call should return the EXACT same deviceCode
    const info2 = await getOrCreateDeviceInfo(tenantId, "DHK1");
    expect(info2.deviceCode).toBe(info1.deviceCode);
    expect(info2.deviceName).toBe(info1.deviceName);
  });

  it("generates strictly sequential, zero-colliding offline invoice numbers", async () => {
    await resetOfflineInvoiceSequence(tenantId);
    const info = await getOrCreateDeviceInfo(tenantId, "DHK1");

    const inv1 = await getNextOfflineInvoiceNumber(tenantId, "DHK1");
    const inv2 = await getNextOfflineInvoiceNumber(tenantId, "DHK1");
    const inv3 = await getNextOfflineInvoiceNumber(tenantId, "DHK1");

    expect(inv1).toBe(`OFF-DHK1-${info.deviceCode}-000001`);
    expect(inv2).toBe(`OFF-DHK1-${info.deviceCode}-000002`);
    expect(inv3).toBe(`OFF-DHK1-${info.deviceCode}-000003`);
  });
});
