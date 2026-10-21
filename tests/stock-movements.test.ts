import { describe, it, expect } from "vitest";
import {
  StockMovementItem,
  deriveStockFromLedger,
  assertStockMatchesLedger,
  calculateStockTakeAdjustment,
  planStockTransfer,
} from "@/lib/inventory/ledger";

describe("Stock Ledger Movements & Invariant Proof", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const locMainStore = "loc-main-store-001";
  const locBranchDhanmondi = "loc-dhanmondi-002";
  const variantId = "var-sony-headphones-001";

  it("acceptance criteria: stock on hand always equals the sum of ledger movements across all operations", () => {
    const movements: StockMovementItem[] = [];

    // Step 1: Initial opening stock adjustment (+100 units @ 15000 poisha)
    movements.push({
      id: "m-1",
      tenant_id: tenantId,
      location_id: locMainStore,
      variant_id: variantId,
      type: "adjustment",
      quantity: 100,
      unit_cost: 15000,
      reference_type: "opening_stock",
    });

    let currentOnHand = deriveStockFromLedger(movements, variantId, locMainStore).current_stock;
    expect(currentOnHand).toBe(100);
    expect(assertStockMatchesLedger(currentOnHand, movements, variantId, locMainStore)).toBe(true);

    // Step 2: Inbound Purchase from supplier (+50 units @ 14000 poisha)
    movements.push({
      id: "m-2",
      tenant_id: tenantId,
      location_id: locMainStore,
      variant_id: variantId,
      type: "purchase",
      quantity: 50,
      unit_cost: 14000,
      reference_id: "po-101",
      reference_type: "purchase",
    });

    currentOnHand = deriveStockFromLedger(movements, variantId, locMainStore).current_stock;
    expect(currentOnHand).toBe(150);
    expect(assertStockMatchesLedger(currentOnHand, movements, variantId, locMainStore)).toBe(true);

    // Step 3: Outbound Sale at POS (-25 units)
    movements.push({
      id: "m-3",
      tenant_id: tenantId,
      location_id: locMainStore,
      variant_id: variantId,
      type: "sale",
      quantity: -25,
      unit_cost: 14000,
      reference_id: "inv-901",
      reference_type: "sale",
    });

    currentOnHand = deriveStockFromLedger(movements, variantId, locMainStore).current_stock;
    expect(currentOnHand).toBe(125);
    expect(assertStockMatchesLedger(currentOnHand, movements, variantId, locMainStore)).toBe(true);

    // Step 4: Customer Return back into stock (+2 units)
    movements.push({
      id: "m-4",
      tenant_id: tenantId,
      location_id: locMainStore,
      variant_id: variantId,
      type: "return",
      quantity: 2,
      unit_cost: 14000,
      reference_id: "ret-401",
      reference_type: "return",
    });

    currentOnHand = deriveStockFromLedger(movements, variantId, locMainStore).current_stock;
    expect(currentOnHand).toBe(127);
    expect(assertStockMatchesLedger(currentOnHand, movements, variantId, locMainStore)).toBe(true);

    // Step 5: Damaged goods write-off adjustment (-5 units)
    movements.push({
      id: "m-5",
      tenant_id: tenantId,
      location_id: locMainStore,
      variant_id: variantId,
      type: "adjustment",
      quantity: -5,
      unit_cost: 14000,
      reference_type: "adjustment",
    });

    currentOnHand = deriveStockFromLedger(movements, variantId, locMainStore).current_stock;
    expect(currentOnHand).toBe(122);
    expect(assertStockMatchesLedger(currentOnHand, movements, variantId, locMainStore)).toBe(true);

    // Step 6: Inter-branch transfer: 20 units moved from Main Store to Dhanmondi Branch
    const transfer = planStockTransfer({
      tenantId,
      fromLocationId: locMainStore,
      toLocationId: locBranchDhanmondi,
      variantId,
      quantity: 20,
      unitCostPoisha: 14000,
    });

    expect(transfer.netTenantDelta).toBe(0); // Transfer creates zero net change for the company

    movements.push({ id: "m-6a", ...transfer.outboundMovement });
    movements.push({ id: "m-6b", ...transfer.inboundMovement });

    // Stock at Main Store is now 122 - 20 = 102
    const mainStoreStock = deriveStockFromLedger(movements, variantId, locMainStore).current_stock;
    expect(mainStoreStock).toBe(102);
    expect(assertStockMatchesLedger(mainStoreStock, movements, variantId, locMainStore)).toBe(true);

    // Stock at Dhanmondi Branch is now +20
    const dhanmondiStock = deriveStockFromLedger(movements, variantId, locBranchDhanmondi).current_stock;
    expect(dhanmondiStock).toBe(20);
    expect(assertStockMatchesLedger(dhanmondiStock, movements, variantId, locBranchDhanmondi)).toBe(true);

    // Overall Tenant Total across all locations remains 122
    const tenantOverallStock = deriveStockFromLedger(movements, variantId).current_stock;
    expect(tenantOverallStock).toBe(122);
    expect(assertStockMatchesLedger(tenantOverallStock, movements, variantId)).toBe(true);
  });

  it("calculates exact cycle count (stock take) adjustments and reconciles balance", () => {
    // Current system stock is 50
    const currentStock = 50;

    // Physical audit counts 47 items (3 missing/theft)
    const countShort = calculateStockTakeAdjustment(47, currentStock);
    expect(countShort.delta).toBe(-3);
    expect(countShort.requiresAdjustment).toBe(true);

    // Physical audit counts 54 items (found unrecorded batch)
    const countOverage = calculateStockTakeAdjustment(54, currentStock);
    expect(countOverage.delta).toBe(4);
    expect(countOverage.requiresAdjustment).toBe(true);

    // Physical audit matches system
    const countMatch = calculateStockTakeAdjustment(50, currentStock);
    expect(countMatch.delta).toBe(0);
    expect(countMatch.requiresAdjustment).toBe(false);
  });
});
