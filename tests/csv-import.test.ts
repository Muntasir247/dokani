import { describe, it, expect } from "vitest";
import { validateProductCSV, exportProductsToCSV } from "@/lib/catalog/csv";
import { generateInternalEAN13 } from "@/lib/barcodes";

describe("CSV Import Validation Engine & Acceptance Criteria", () => {
  it("acceptance criteria: importing a 500-row CSV with 5 bad rows reports exactly those rows and imports nothing in dry-run mode", () => {
    const headers = "name,category,brand,unit,sku,barcode,cost_price,retail_price,tax_rate,reorder_point,opening_stock,has_serials,warranty_months";
    const rows: string[] = [headers];

    // Known bad row indices in data (1-based row number including header)
    // Row 1 is header.
    // Row 42 -> missing name
    // Row 105 -> duplicate SKU (same SKU as row 100)
    // Row 210 -> negative retail price
    // Row 340 -> invalid EAN-13 barcode check digit
    // Row 499 -> negative warranty months
    const badRowMap: Record<number, { column: string }> = {
      42: { column: "name" },
      105: { column: "sku" },
      210: { column: "retail_price" },
      340: { column: "barcode" },
      499: { column: "warranty_months" },
    };

    let skuRow100 = "";

    for (let i = 1; i <= 500; i++) {
      const rowNum = i + 1; // 1-based row in CSV file
      const baseSku = `SKU-TEST-${i.toString().padStart(4, "0")}`;
      const validBarcode = generateInternalEAN13();

      if (rowNum === 100) {
        skuRow100 = baseSku;
      }

      if (rowNum === 42) {
        // Bad row 1: empty product name
        rows.push(`,Electronics,Sony,pcs,${baseSku},${validBarcode},100.00,150.00,5.00,5,10,no,0`);
      } else if (rowNum === 105) {
        // Bad row 2: duplicate SKU of row 100
        rows.push(`Product 105,Electronics,Sony,pcs,${skuRow100},${validBarcode},100.00,150.00,5.00,5,10,no,0`);
      } else if (rowNum === 210) {
        // Bad row 3: negative retail price (-50.00)
        rows.push(`Product 210,Electronics,Sony,pcs,${baseSku},${validBarcode},100.00,-50.00,5.00,5,10,no,0`);
      } else if (rowNum === 340) {
        // Bad row 4: corrupted barcode (bad check digit)
        const corruptedBarcode = "2001234567899"; // invalid check digit
        rows.push(`Product 340,Electronics,Sony,pcs,${baseSku},${corruptedBarcode},100.00,150.00,5.00,5,10,no,0`);
      } else if (rowNum === 499) {
        // Bad row 5: negative warranty months
        rows.push(`Product 499,Electronics,Sony,pcs,${baseSku},${validBarcode},100.00,150.00,5.00,5,10,no,-6`);
      } else {
        // Clean valid row
        rows.push(`Product ${i},Electronics,Sony,pcs,${baseSku},${validBarcode},100.00,150.00,5.00,5,10,no,12`);
      }
    }

    const csvContent = rows.join("\n");

    // 1. Run in dry-run mode
    const dryRunReport = validateProductCSV(csvContent, new Set(), true);

    expect(dryRunReport.totalRows).toBe(500);
    expect(dryRunReport.validCount).toBe(495);
    expect(dryRunReport.errorCount).toBe(5);
    expect(dryRunReport.dryRun).toBe(true);
    expect(dryRunReport.imported).toBe(false);

    // Verify exact reported row numbers and columns
    const errorRows = dryRunReport.errors.map((e) => e.row).sort((a, b) => a - b);
    expect(errorRows).toEqual([42, 105, 210, 340, 499]);

    const errorColMap = Object.fromEntries(dryRunReport.errors.map((e) => [e.row, e.column]));
    expect(errorColMap[42]).toBe("name");
    expect(errorColMap[105]).toBe("sku");
    expect(errorColMap[210]).toBe("retail_price");
    expect(errorColMap[340]).toBe("barcode");
    expect(errorColMap[499]).toBe("warranty_months");

    // 2. When dryRun is false, but errors exist, ensure it STILL refuses to import
    const nonDryRunReportWithErrors = validateProductCSV(csvContent, new Set(), false);
    expect(nonDryRunReportWithErrors.imported).toBe(false);
    expect(nonDryRunReportWithErrors.errorCount).toBe(5);
  });

  it("exports products to standard CSV with headers and escaped values", () => {
    const products = [
      {
        name: 'Smart "OLED" TV, 55"',
        category: "Televisions",
        brand: "Samsung",
        unit: "pcs",
        has_serials: true,
        warranty_months: 24,
        variants: [
          {
            name: "55 Inch Black",
            sku: "SAM-TV-55-BLK",
            barcode: "2001111111112",
            cost_price: 6500000,
            retail_price: 8500000,
            wholesale_price: 7800000,
            tax_rate: 5,
            reorder_point: 3,
            current_stock: 8,
          },
        ],
      },
    ];

    const csvOutput = exportProductsToCSV(products);
    expect(csvOutput.includes('Smart ""OLED"" TV, 55"')).toBe(true);
    expect(csvOutput.includes("SAM-TV-55-BLK")).toBe(true);
    expect(csvOutput.includes("85000.00")).toBe(true); // retail_price_bdt
    expect(csvOutput.includes("yes")).toBe(true); // has_serials
  });
});
