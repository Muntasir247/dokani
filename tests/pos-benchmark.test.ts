import { describe, it, expect, beforeEach } from "vitest";
import { useCartStore, PosVariant } from "@/lib/pos/cart-store";

describe("POS UI Barcode Scan Performance Benchmark", () => {
  let catalogMap: Map<string, PosVariant>;

  beforeEach(() => {
    useCartStore.getState().clearCart();

    // Populate realistic catalog of 1,000 items
    catalogMap = new Map<string, PosVariant>();
    for (let i = 1; i <= 1000; i++) {
      const barcode = `20000000${String(i).padStart(5, "0")}`;
      const variant: PosVariant = {
        id: `var-${i}`,
        productId: `prod-${i}`,
        productName: `Test Product ${i}`,
        variantName: "Standard",
        sku: `SKU-${i}`,
        barcode,
        retailPricePoisha: 25000 + i * 10,
        costPricePoisha: 18000,
        taxRateBasisPoints: 500,
        hasSerials: false,
        warrantyMonths: 0,
        currentStock: 100,
      };
      catalogMap.set(barcode, variant);
      catalogMap.set(variant.sku, variant);
    }
  });

  it("adds an item via barcode scan in UNDER 100 ms (Acceptance Criterion)", () => {
    const targetBarcode = "2000000000050";

    const t0 = performance.now();
    const success = useCartStore.getState().scanBarcode(targetBarcode, catalogMap);
    const t1 = performance.now();

    const elapsedMs = t1 - t0;

    expect(success).toBe(true);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].barcode).toBe(targetBarcode);
    expect(useCartStore.getState().items[0].quantity).toBe(1);

    // CRITICAL ACCEPTANCE CRITERIA: under 100 ms
    expect(elapsedMs).toBeLessThan(100);

    // Report measured response time
    console.log(`[PERF BENCHMARK] Single barcode scan-to-cart latency: ${elapsedMs.toFixed(3)} ms (Target: < 100 ms)`);
  });

  it("handles rapid burst scanning (50 consecutive barcode scans) within budget", () => {
    const t0 = performance.now();

    for (let i = 1; i <= 50; i++) {
      const barcode = `20000000${String(i).padStart(5, "0")}`;
      useCartStore.getState().scanBarcode(barcode, catalogMap);
    }

    const t1 = performance.now();
    const totalElapsedMs = t1 - t0;
    const avgPerScanMs = totalElapsedMs / 50;

    expect(useCartStore.getState().items).toHaveLength(50);
    expect(avgPerScanMs).toBeLessThan(5); // Average per scan should be < 5ms

    console.log(
      `[PERF BENCHMARK] Burst 50 scans total: ${totalElapsedMs.toFixed(2)} ms, Avg: ${avgPerScanMs.toFixed(3)} ms/scan`
    );
  });

  it("holds and resumes carts instantaneously", () => {
    // Add 2 items
    useCartStore.getState().scanBarcode("2000000000001", catalogMap);
    useCartStore.getState().scanBarcode("2000000000002", catalogMap);

    // Hold current cart
    const holdId = useCartStore.getState().holdCurrentCart("Customer Walk-in");
    expect(holdId).toBeTruthy();
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().heldCarts).toHaveLength(1);

    // Resume held cart
    const resumed = useCartStore.getState().resumeHeldCart(holdId);
    expect(resumed).toBe(true);
    expect(useCartStore.getState().items).toHaveLength(2);
    expect(useCartStore.getState().heldCarts).toHaveLength(0);
  });
});
