import { MovementType } from "@/types/database.types";

export interface StockMovementItem {
  id: string;
  tenant_id: string;
  location_id: string;
  variant_id: string;
  type: MovementType;
  quantity: number;
  unit_cost: number; // poisha
  reference_id?: string | null;
  reference_type?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface StockBalanceSummary {
  variant_id: string;
  location_id?: string;
  current_stock: number;
  total_purchased: number;
  total_sold: number;
  total_returned: number;
  total_adjusted: number;
  total_transferred_in: number;
  total_transferred_out: number;
  total_movements_count: number;
  is_low_stock: boolean;
}

/**
 * Derives stock on hand strictly by aggregating immutable movements from the stock ledger.
 * Matches PostgreSQL's `view_current_stock` and `fn_get_stock_quantity`.
 */
export function deriveStockFromLedger(
  movements: StockMovementItem[],
  variantId: string,
  locationId?: string,
  reorderPoint: number = 5
): StockBalanceSummary {
  const filtered = movements.filter((m) => {
    if (m.variant_id !== variantId) return false;
    if (locationId && m.location_id !== locationId) return false;
    return true;
  });

  let current_stock = 0;
  let total_purchased = 0;
  let total_sold = 0;
  let total_returned = 0;
  let total_adjusted = 0;
  let total_transferred_in = 0;
  let total_transferred_out = 0;

  for (const m of filtered) {
    current_stock += m.quantity;

    switch (m.type) {
      case "purchase":
        total_purchased += m.quantity;
        break;
      case "sale":
        total_sold += Math.abs(m.quantity);
        break;
      case "return":
        total_returned += m.quantity;
        break;
      case "adjustment":
        total_adjusted += m.quantity;
        break;
      case "transfer_in":
        total_transferred_in += m.quantity;
        break;
      case "transfer_out":
        total_transferred_out += Math.abs(m.quantity);
        break;
    }
  }

  return {
    variant_id: variantId,
    location_id: locationId,
    current_stock,
    total_purchased,
    total_sold,
    total_returned,
    total_adjusted,
    total_transferred_in,
    total_transferred_out,
    total_movements_count: filtered.length,
    is_low_stock: current_stock <= reorderPoint,
  };
}

/**
 * Verifies the fundamental inventory invariant:
 * Current stock on hand must EXACTLY equal the arithmetic sum of all ledger movements.
 */
export function assertStockMatchesLedger(
  stockOnHand: number,
  movements: StockMovementItem[],
  variantId: string,
  locationId?: string
): boolean {
  const derived = deriveStockFromLedger(movements, variantId, locationId);
  return stockOnHand === derived.current_stock;
}

/**
 * Computes the reconciliation delta for cycle count / stock take.
 * Example: Physical counted = 18, System currently = 20 -> Delta = -2 (adjustment of -2).
 */
export function calculateStockTakeAdjustment(
  countedQuantity: number,
  currentStock: number
): { delta: number; requiresAdjustment: boolean } {
  if (countedQuantity < 0) {
    throw new Error("Counted physical quantity cannot be negative.");
  }
  const delta = countedQuantity - currentStock;
  return {
    delta,
    requiresAdjustment: delta !== 0,
  };
}

/**
 * Plans a balanced inter-branch transfer.
 * Generates paired movements: transfer_out (-quantity) and transfer_in (+quantity).
 * Total net quantity change across the tenant is strictly 0.
 */
export function planStockTransfer(params: {
  tenantId: string;
  fromLocationId: string;
  toLocationId: string;
  variantId: string;
  quantity: number;
  unitCostPoisha: number;
}): {
  outboundMovement: Omit<StockMovementItem, "id">;
  inboundMovement: Omit<StockMovementItem, "id">;
  netTenantDelta: number;
} {
  const { tenantId, fromLocationId, toLocationId, variantId, quantity, unitCostPoisha } = params;

  if (quantity <= 0) {
    throw new Error("Transfer quantity must be greater than zero.");
  }
  if (fromLocationId === toLocationId) {
    throw new Error("Source and destination locations cannot be identical.");
  }

  const outbound: Omit<StockMovementItem, "id"> = {
    tenant_id: tenantId,
    location_id: fromLocationId,
    variant_id: variantId,
    type: "transfer_out",
    quantity: -quantity,
    unit_cost: unitCostPoisha,
    reference_type: "transfer",
  };

  const inbound: Omit<StockMovementItem, "id"> = {
    tenant_id: tenantId,
    location_id: toLocationId,
    variant_id: variantId,
    type: "transfer_in",
    quantity: quantity,
    unit_cost: unitCostPoisha,
    reference_type: "transfer",
  };

  return {
    outboundMovement: outbound,
    inboundMovement: inbound,
    netTenantDelta: outbound.quantity + inbound.quantity, // strictly 0
  };
}
