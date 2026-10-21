import { describe, it, expect } from "vitest";
import { calculateWeightedAverageCost } from "@/lib/inventory/cost";
import {
  deriveStockFromLedger,
  assertStockMatchesLedger,
  StockMovementItem,
} from "@/lib/inventory/ledger";
import { generateSKU, generateInternalEAN13, isValidEAN13 } from "@/lib/barcodes";
import { parseBulkSerials, transitionSerialStatus } from "@/lib/inventory/serials";

describe("Catalog & Inventory End-to-End Workflow Integration Test", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const storeId = "11111111-2222-1111-1111-111111111111";
  const locationId = "11111111-3333-1111-1111-111111111111";

  it("completes full end-to-end lifecycle: create product -> receive stock (with WAC) -> adjust stock -> verify ledger balance", () => {
    // 1. Create Product & Variant
    const product = {
      id: "prod-gadget-001",
      tenant_id: tenantId,
      name: "Smart Watch Pro",
      unit: "pcs",
      has_serials: true,
      warranty_months: 12,
    };

    const variant = {
      id: "var-gadget-001-black",
      product_id: product.id,
      tenant_id: tenantId,
      name: "Black 44mm",
      sku: generateSKU("DOK", "WCH"),
      barcode: generateInternalEAN13(),
      cost_price: 250000, // 2,500.00 BDT
      retail_price: 350000, // 3,500.00 BDT
      reorder_point: 5,
    };

    expect(isValidEAN13(variant.barcode)).toBe(true);

    const ledgerMovements: StockMovementItem[] = [];

    // Opening stock: 10 units @ 2500.00 BDT
    ledgerMovements.push({
      id: "mov-open-1",
      tenant_id: tenantId,
      location_id: locationId,
      variant_id: variant.id,
      type: "adjustment",
      quantity: 10,
      unit_cost: variant.cost_price,
      reference_type: "opening_stock",
      notes: "Initial opening stock",
    });

    let currentStock = deriveStockFromLedger(ledgerMovements, variant.id, locationId).current_stock;
    expect(currentStock).toBe(10);
    expect(assertStockMatchesLedger(currentStock, ledgerMovements, variant.id, locationId)).toBe(true);

    // 2. Inbound Purchase Receiving
    // Receive 20 units @ 2800.00 BDT (280,000 poisha)
    const incomingQty = 20;
    const incomingCostPoisha = 280000;
    const serialInputRaw = "SW-101, SW-102, SW-103";
    const { serials } = parseBulkSerials(serialInputRaw);
    expect(serials).toHaveLength(3);

    // Calculate new Weighted Average Cost (WAC)
    // (10 * 250000 + 20 * 280000) / 30 = (2,500,000 + 5,600,000) / 30 = 8,100,000 / 30 = 270,000 poisha (2,700.00 BDT)
    const newWacCost = calculateWeightedAverageCost({
      currentStock,
      currentCostPoisha: variant.cost_price,
      incomingQuantity: incomingQty,
      incomingCostPoisha,
    });

    expect(newWacCost).toBe(270000); // exactly 2,700.00 BDT
    variant.cost_price = newWacCost;

    // Record purchase ledger movement
    ledgerMovements.push({
      id: "mov-po-1",
      tenant_id: tenantId,
      location_id: locationId,
      variant_id: variant.id,
      type: "purchase",
      quantity: incomingQty,
      unit_cost: incomingCostPoisha,
      reference_id: "po-inv-001",
      reference_type: "purchase",
    });

    currentStock = deriveStockFromLedger(ledgerMovements, variant.id, locationId).current_stock;
    expect(currentStock).toBe(30);
    expect(assertStockMatchesLedger(currentStock, ledgerMovements, variant.id, locationId)).toBe(true);

    // 3. Manual Stock Adjustment (e.g. 2 units damaged in stockroom)
    const damageAdjustmentQty = -2;
    ledgerMovements.push({
      id: "mov-adj-1",
      tenant_id: tenantId,
      location_id: locationId,
      variant_id: variant.id,
      type: "adjustment",
      quantity: damageAdjustmentQty,
      unit_cost: variant.cost_price,
      reference_type: "adjustment",
      notes: "Damaged goods / display item dropped",
    });

    currentStock = deriveStockFromLedger(ledgerMovements, variant.id, locationId).current_stock;
    expect(currentStock).toBe(28);
    expect(assertStockMatchesLedger(currentStock, ledgerMovements, variant.id, locationId)).toBe(true);

    // 4. Verify Serial Single-Sale Security Rule
    const serial1 = {
      tenant_id: tenantId,
      variant_id: variant.id,
      stock_location_id: locationId,
      serial_number: "SW-101",
      status: "available" as const,
      warranty_months: 12,
      times_sold: 0,
      sold_at: null,
    };

    const soldSerial = transitionSerialStatus(serial1, "sold");
    expect(soldSerial.status).toBe("sold");
    expect(soldSerial.times_sold).toBe(1);

    // Assert second sale attempt fails
    expect(() => transitionSerialStatus(soldSerial, "sold")).toThrow(
      /already sold and cannot be sold again/
    );
  });
});
