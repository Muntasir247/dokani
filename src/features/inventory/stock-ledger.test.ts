import { describe, it, expect } from "vitest";
import { MovementType } from "@/types/database.types";

interface StockMovement {
  id: string;
  tenant_id: string;
  location_id: string;
  variant_id: string;
  type: MovementType;
  quantity: number;
}

interface StockBalance {
  current_stock: number;
  total_purchased: number;
  total_sold: number;
  total_returned: number;
  total_adjusted: number;
  is_low_stock: boolean;
}

/**
 * TypeScript pure reference implementation of the Postgres `view_current_stock` logic.
 * Proves that append-only ledger derivation is deterministic and reconciles accurately.
 */
function deriveCurrentStock(
  movements: StockMovement[],
  variantId: string,
  locationId: string,
  reorderPoint: number = 5
): StockBalance {
  const filtered = movements.filter(
    (m) => m.variant_id === variantId && m.location_id === locationId
  );

  let current_stock = 0;
  let total_purchased = 0;
  let total_sold = 0;
  let total_returned = 0;
  let total_adjusted = 0;

  for (const m of filtered) {
    current_stock += m.quantity;
    if (m.type === "purchase") total_purchased += m.quantity;
    if (m.type === "sale") total_sold += Math.abs(m.quantity);
    if (m.type === "return") total_returned += m.quantity;
    if (m.type === "adjustment") total_adjusted += m.quantity;
  }

  return {
    current_stock,
    total_purchased,
    total_sold,
    total_returned,
    total_adjusted,
    is_low_stock: current_stock <= reorderPoint,
  };
}

describe("Stock Ledger Derived Quantities", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const locationId = "11111111-3333-1111-1111-111111111111";
  const variantAnkerWhite = "11111111-7777-1111-1111-111111111111";

  it("calculates exact stock balance matching seed movements", () => {
    // Replicating seed movements: Inbound 50 units purchase, Outbound 2 units sale
    const movements: StockMovement[] = [
      {
        id: "m-1",
        tenant_id: tenantId,
        location_id: locationId,
        variant_id: variantAnkerWhite,
        type: "purchase",
        quantity: 50,
      },
      {
        id: "m-2",
        tenant_id: tenantId,
        location_id: locationId,
        variant_id: variantAnkerWhite,
        type: "sale",
        quantity: -2,
      },
    ];

    const result = deriveCurrentStock(movements, variantAnkerWhite, locationId, 10);

    expect(result.current_stock).toBe(48);
    expect(result.total_purchased).toBe(50);
    expect(result.total_sold).toBe(2);
    expect(result.is_low_stock).toBe(false);
  });

  it("handles returns and physical adjustments correctly", () => {
    const movements: StockMovement[] = [
      {
        id: "m-1",
        tenant_id: tenantId,
        location_id: locationId,
        variant_id: variantAnkerWhite,
        type: "purchase",
        quantity: 20,
      },
      {
        id: "m-2",
        tenant_id: tenantId,
        location_id: locationId,
        variant_id: variantAnkerWhite,
        type: "sale",
        quantity: -15,
      },
      {
        id: "m-3",
        tenant_id: tenantId,
        location_id: locationId,
        variant_id: variantAnkerWhite,
        type: "return",
        quantity: 1, // Customer returned 1 item
      },
      {
        id: "m-4",
        tenant_id: tenantId,
        location_id: locationId,
        variant_id: variantAnkerWhite,
        type: "adjustment",
        quantity: -1, // Damaged in store
      },
    ];

    const result = deriveCurrentStock(movements, variantAnkerWhite, locationId, 5);

    // 20 - 15 + 1 - 1 = 5
    expect(result.current_stock).toBe(5);
    expect(result.total_returned).toBe(1);
    expect(result.total_adjusted).toBe(-1);
    expect(result.is_low_stock).toBe(true); // 5 <= reorderPoint 5
  });

  it("accurately isolates stock between different variants and locations", () => {
    const variantAnkerBlack = "11111111-7777-2222-1111-111111111111";
    const warehouseLocationId = "11111111-3333-2222-1111-111111111111";

    const movements: StockMovement[] = [
      {
        id: "m-1",
        tenant_id: tenantId,
        location_id: locationId,
        variant_id: variantAnkerWhite,
        quantity: 50,
        type: "purchase",
      },
      {
        id: "m-2",
        tenant_id: tenantId,
        location_id: warehouseLocationId,
        variant_id: variantAnkerWhite,
        quantity: 100,
        type: "purchase",
      },
      {
        id: "m-3",
        tenant_id: tenantId,
        location_id: locationId,
        variant_id: variantAnkerBlack,
        quantity: 40,
        type: "purchase",
      },
    ];

    const whiteFloor = deriveCurrentStock(movements, variantAnkerWhite, locationId);
    const whiteWarehouse = deriveCurrentStock(movements, variantAnkerWhite, warehouseLocationId);
    const blackFloor = deriveCurrentStock(movements, variantAnkerBlack, locationId);

    expect(whiteFloor.current_stock).toBe(50);
    expect(whiteWarehouse.current_stock).toBe(100);
    expect(blackFloor.current_stock).toBe(40);
  });
});
