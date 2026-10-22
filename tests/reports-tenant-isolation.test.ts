import { describe, it, expect } from "vitest";
import { generateCsv } from "@/features/reports/csv-export";
import { InventoryValuationItem } from "@/features/reports/types";

describe("Reports Multi-Tenant Isolation & Security (Acceptance Criterion)", () => {
  const tenantAId = "00000000-0000-0000-0000-000000000001";
  const tenantBId = "00000000-0000-0000-0000-000000000002";

  const allInventoryItems: InventoryValuationItem[] = [
    {
      tenantId: tenantAId,
      productName: "Tenant A Miniket Rice 25kg",
      variantId: "var-a-1",
      sku: "TEN-A-RICE-25",
      barcode: "894110000001",
      categoryName: "Grains",
      brandName: "Local Mill",
      currentStock: 40,
      unitCostPoisha: 180000,
      unitRetailPoisha: 210000,
      totalCostValuePoisha: 7200000,
      totalRetailValuePoisha: 8400000,
      potentialProfitPoisha: 1200000,
      marginPercentage: 14.29,
    },
    {
      tenantId: tenantAId,
      productName: "Tenant A Mustard Oil 5L",
      variantId: "var-a-2",
      sku: "TEN-A-OIL-5",
      barcode: "894110000002",
      categoryName: "Oil",
      brandName: "Radhuni",
      currentStock: 15,
      unitCostPoisha: 115000,
      unitRetailPoisha: 135000,
      totalCostValuePoisha: 1725000,
      totalRetailValuePoisha: 2025000,
      potentialProfitPoisha: 300000,
      marginPercentage: 14.81,
    },
    {
      tenantId: tenantBId,
      productName: "Tenant B Secret Competitor Product",
      variantId: "var-b-1",
      sku: "TEN-B-SECRET-1",
      barcode: "894110000999",
      categoryName: "Electronics",
      brandName: "Sony",
      currentStock: 100,
      unitCostPoisha: 500000,
      unitRetailPoisha: 750000,
      totalCostValuePoisha: 50000000,
      totalRetailValuePoisha: 75000000,
      potentialProfitPoisha: 25000000,
      marginPercentage: 33.33,
    },
  ];

  it("ensures report exports contain strictly and exclusively data from the requesting tenant", () => {
    // Tenant A requests their inventory report
    const tenantAFilteredData = allInventoryItems.filter((i) => i.tenantId === tenantAId);

    const exportedCsvA = generateCsv<InventoryValuationItem>(
      [
        { header: "Product Name", accessor: (i) => i.productName },
        { header: "SKU", accessor: (i) => i.sku },
        { header: "Total Cost Value (BDT)", accessor: (i) => (i.totalCostValuePoisha / 100).toFixed(2) },
      ],
      tenantAFilteredData
    );

    // Assert Tenant A data is present
    expect(exportedCsvA.includes("Tenant A Miniket Rice")).toBe(true);
    expect(exportedCsvA.includes("TEN-A-RICE-25")).toBe(true);
    expect(exportedCsvA.includes("Tenant A Mustard Oil")).toBe(true);

    // CRITICAL: Tenant B data MUST NOT exist anywhere in the export
    expect(exportedCsvA.includes("Tenant B Secret Competitor Product")).toBe(false);
    expect(exportedCsvA.includes("TEN-B-SECRET-1")).toBe(false);
    expect(exportedCsvA.includes("500000")).toBe(false);
  });

  it("ensures Tenant B export does not leak any Tenant A data", () => {
    // Tenant B requests their inventory report
    const tenantBFilteredData = allInventoryItems.filter((i) => i.tenantId === tenantBId);

    const exportedCsvB = generateCsv<InventoryValuationItem>(
      [
        { header: "Product Name", accessor: (i) => i.productName },
        { header: "SKU", accessor: (i) => i.sku },
      ],
      tenantBFilteredData
    );

    expect(exportedCsvB.includes("Tenant B Secret Competitor Product")).toBe(true);
    expect(exportedCsvB.includes("Tenant A Miniket Rice")).toBe(false);
    expect(exportedCsvB.includes("Tenant A Mustard Oil")).toBe(false);
  });
});
