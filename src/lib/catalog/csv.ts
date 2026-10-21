import { toPoisha, fromPoisha } from "@/lib/money";
import { isValidBarcode } from "@/lib/barcodes";

export interface CSVProductRow {
  name: string;
  category?: string;
  brand?: string;
  unit?: string;
  sku: string;
  barcode?: string;
  cost_price?: string; // in BDT, e.g. "100.00"
  retail_price: string; // in BDT, e.g. "150.00"
  wholesale_price?: string;
  tax_rate?: string;
  reorder_point?: string;
  opening_stock?: string;
  has_serials?: string; // "true" / "false" / "yes" / "no"
  warranty_months?: string;
}

export interface CSVRowError {
  row: number; // 1-based index (Header is row 1, data starts at row 2)
  column: string;
  value: string;
  message: string;
}

export interface ValidatedProductItem {
  row: number;
  name: string;
  categoryName?: string;
  brandName?: string;
  unit: string;
  sku: string;
  barcode: string | null;
  costPricePoisha: number;
  retailPricePoisha: number;
  wholesalePricePoisha: number;
  taxRate: number;
  reorderPoint: number;
  openingStock: number;
  hasSerials: boolean;
  warrantyMonths: number;
}

export interface CSVValidationReport {
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: CSVRowError[];
  dryRun: boolean;
  imported: boolean;
  validRows: ValidatedProductItem[];
}

/**
 * Robust RFC 4180 CSV line parser supporting quoted strings, escaped quotes, and commas.
 */
export function parseCSVString(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  const text = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Validates product CSV data with comprehensive per-row error reporting.
 *
 * @param csvContent Raw CSV text
 * @param existingSKUs Set of SKUs already committed in the database for this tenant
 * @param dryRun If true, produces validation report without committing anything
 */
export function validateProductCSV(
  csvContent: string,
  existingSKUs: Set<string> = new Set(),
  dryRun: boolean = true
): CSVValidationReport {
  const rows = parseCSVString(csvContent);

  if (rows.length === 0) {
    return {
      totalRows: 0,
      validCount: 0,
      errorCount: 1,
      errors: [
        {
          row: 1,
          column: "file",
          value: "",
          message: "CSV file is empty.",
        },
      ],
      dryRun,
      imported: false,
      validRows: [],
    };
  }

  const rawHeaders = rows[0].map((h) => h.toLowerCase().trim().replace(/[\s_-]+/g, ""));
  const headerMap: Record<string, number> = {};
  rawHeaders.forEach((h, index) => {
    headerMap[h] = index;
  });

  const getCol = (hName: string): number => {
    return headerMap[hName] !== undefined ? headerMap[hName] : -1;
  };

  const nameIdx = getCol("name") !== -1 ? getCol("name") : getCol("productname");
  const skuIdx = getCol("sku");
  const retailPriceIdx =
    getCol("retailprice") !== -1 ? getCol("retailprice") : getCol("price");
  const costPriceIdx = getCol("costprice") !== -1 ? getCol("costprice") : getCol("cost");
  const barcodeIdx = getCol("barcode");
  const categoryIdx = getCol("category");
  const brandIdx = getCol("brand");
  const unitIdx = getCol("unit");
  const wholesaleIdx = getCol("wholesaleprice");
  const taxIdx = getCol("taxrate") !== -1 ? getCol("taxrate") : getCol("tax");
  const reorderIdx = getCol("reorderpoint") !== -1 ? getCol("reorderpoint") : getCol("minstock");
  const stockIdx = getCol("openingstock") !== -1 ? getCol("openingstock") : getCol("stock");
  const serialsIdx = getCol("hasserials") !== -1 ? getCol("hasserials") : getCol("serials");
  const warrantyIdx = getCol("warrantymonths") !== -1 ? getCol("warrantymonths") : getCol("warranty");

  if (nameIdx === -1 || skuIdx === -1 || retailPriceIdx === -1) {
    return {
      totalRows: rows.length - 1,
      validCount: 0,
      errorCount: 1,
      errors: [
        {
          row: 1,
          column: "headers",
          value: rows[0].join(", "),
          message: "CSV must include 'name', 'sku', and 'retail_price' headers.",
        },
      ],
      dryRun,
      imported: false,
      validRows: [],
    };
  }

  const errors: CSVRowError[] = [];
  const validRows: ValidatedProductItem[] = [];
  const seenSKUsInCSV = new Set<string>();

  const dataRows = rows.slice(1);

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 2; // 1-based, row 1 is header
    const r = dataRows[i];

    const name = (r[nameIdx] || "").trim();
    const sku = (r[skuIdx] || "").trim().toUpperCase();
    const retailPriceStr = (r[retailPriceIdx] || "").trim();
    const costPriceStr = costPriceIdx !== -1 ? (r[costPriceIdx] || "").trim() : "";
    const barcodeStr = barcodeIdx !== -1 ? (r[barcodeIdx] || "").trim() : "";
    const categoryName = categoryIdx !== -1 ? (r[categoryIdx] || "").trim() : "";
    const brandName = brandIdx !== -1 ? (r[brandIdx] || "").trim() : "";
    const unit = unitIdx !== -1 && (r[unitIdx] || "").trim() ? (r[unitIdx] || "").trim() : "pcs";
    const wholesalePriceStr = wholesaleIdx !== -1 ? (r[wholesaleIdx] || "").trim() : "";
    const taxRateStr = taxIdx !== -1 ? (r[taxIdx] || "").trim() : "";
    const reorderStr = reorderIdx !== -1 ? (r[reorderIdx] || "").trim() : "";
    const stockStr = stockIdx !== -1 ? (r[stockIdx] || "").trim() : "";
    const serialsStr = serialsIdx !== -1 ? (r[serialsIdx] || "").trim().toLowerCase() : "";
    const warrantyStr = warrantyIdx !== -1 ? (r[warrantyIdx] || "").trim() : "";

    let rowHasError = false;

    // 1. Name validation
    if (!name) {
      errors.push({
        row: rowNum,
        column: "name",
        value: name,
        message: "Product name is required.",
      });
      rowHasError = true;
    }

    // 2. SKU validation & uniqueness
    if (!sku) {
      errors.push({
        row: rowNum,
        column: "sku",
        value: sku,
        message: "SKU is required.",
      });
      rowHasError = true;
    } else if (seenSKUsInCSV.has(sku)) {
      errors.push({
        row: rowNum,
        column: "sku",
        value: sku,
        message: `Duplicate SKU '${sku}' found within this CSV file.`,
      });
      rowHasError = true;
    } else if (existingSKUs.has(sku)) {
      errors.push({
        row: rowNum,
        column: "sku",
        value: sku,
        message: `SKU '${sku}' already exists in your store inventory.`,
      });
      rowHasError = true;
    } else {
      seenSKUsInCSV.add(sku);
    }

    // 3. Retail Price validation
    const retailNum = parseFloat(retailPriceStr);
    if (!retailPriceStr || isNaN(retailNum) || retailNum < 0) {
      errors.push({
        row: rowNum,
        column: "retail_price",
        value: retailPriceStr,
        message: "Retail price must be a valid non-negative number.",
      });
      rowHasError = true;
    }

    // 4. Cost Price validation (if provided)
    let costPricePoisha = 0;
    if (costPriceStr) {
      const costNum = parseFloat(costPriceStr);
      if (isNaN(costNum) || costNum < 0) {
        errors.push({
          row: rowNum,
          column: "cost_price",
          value: costPriceStr,
          message: "Cost price must be a valid non-negative number.",
        });
        rowHasError = true;
      } else {
        costPricePoisha = toPoisha(costNum);
      }
    }

    // 5. Wholesale Price validation (if provided)
    let wholesalePricePoisha = 0;
    if (wholesalePriceStr) {
      const wholesaleNum = parseFloat(wholesalePriceStr);
      if (isNaN(wholesaleNum) || wholesaleNum < 0) {
        errors.push({
          row: rowNum,
          column: "wholesale_price",
          value: wholesalePriceStr,
          message: "Wholesale price must be a valid non-negative number.",
        });
        rowHasError = true;
      } else {
        wholesalePricePoisha = toPoisha(wholesaleNum);
      }
    }

    // 6. Barcode validation (if provided)
    if (barcodeStr && !isValidBarcode(barcodeStr)) {
      errors.push({
        row: rowNum,
        column: "barcode",
        value: barcodeStr,
        message: `Barcode '${barcodeStr}' has an invalid format or check digit.`,
      });
      rowHasError = true;
    }

    // 7. Tax Rate validation
    let taxRate = 0;
    if (taxRateStr) {
      const t = parseFloat(taxRateStr);
      if (isNaN(t) || t < 0 || t > 100) {
        errors.push({
          row: rowNum,
          column: "tax_rate",
          value: taxRateStr,
          message: "Tax rate must be between 0.00 and 100.00%.",
        });
        rowHasError = true;
      } else {
        taxRate = t;
      }
    }

    // 8. Reorder point
    let reorderPoint = 5;
    if (reorderStr) {
      const ro = parseInt(reorderStr, 10);
      if (isNaN(ro) || ro < 0) {
        errors.push({
          row: rowNum,
          column: "reorder_point",
          value: reorderStr,
          message: "Reorder point must be a non-negative integer.",
        });
        rowHasError = true;
      } else {
        reorderPoint = ro;
      }
    }

    // 9. Opening stock
    let openingStock = 0;
    if (stockStr) {
      const s = parseInt(stockStr, 10);
      if (isNaN(s) || s < 0) {
        errors.push({
          row: rowNum,
          column: "opening_stock",
          value: stockStr,
          message: "Opening stock must be a non-negative integer.",
        });
        rowHasError = true;
      } else {
        openingStock = s;
      }
    }

    // 10. Serials & warranty
    const hasSerials = serialsStr === "true" || serialsStr === "yes" || serialsStr === "1";
    let warrantyMonths = 0;
    if (warrantyStr) {
      const w = parseInt(warrantyStr, 10);
      if (isNaN(w) || w < 0) {
        errors.push({
          row: rowNum,
          column: "warranty_months",
          value: warrantyStr,
          message: "Warranty months must be a non-negative integer.",
        });
        rowHasError = true;
      } else {
        warrantyMonths = w;
      }
    }

    if (!rowHasError) {
      validRows.push({
        row: rowNum,
        name,
        categoryName: categoryName || undefined,
        brandName: brandName || undefined,
        unit,
        sku,
        barcode: barcodeStr || null,
        costPricePoisha,
        retailPricePoisha: toPoisha(retailNum),
        wholesalePricePoisha,
        taxRate,
        reorderPoint,
        openingStock,
        hasSerials,
        warrantyMonths,
      });
    }
  }

  return {
    totalRows: dataRows.length,
    validCount: validRows.length,
    errorCount: errors.length,
    errors,
    dryRun,
    imported: !dryRun && errors.length === 0,
    validRows,
  };
}

/**
 * Generates an RFC 4180 compliant CSV string from an array of products with variants.
 */
export function exportProductsToCSV(
  products: Array<{
    name: string;
    category?: string | null;
    brand?: string | null;
    unit: string;
    has_serials: boolean;
    warranty_months: number;
    variants: Array<{
      name: string;
      sku: string;
      barcode: string | null;
      cost_price: number;
      retail_price: number;
      wholesale_price: number;
      tax_rate: number;
      reorder_point: number;
      current_stock?: number;
    }>;
  }>
): string {
  const headers = [
    "name",
    "category",
    "brand",
    "unit",
    "variant_name",
    "sku",
    "barcode",
    "cost_price_bdt",
    "retail_price_bdt",
    "wholesale_price_bdt",
    "tax_rate",
    "reorder_point",
    "current_stock",
    "has_serials",
    "warranty_months",
  ];

  const escapeCSV = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(",")];

  for (const product of products) {
    for (const variant of product.variants) {
      lines.push(
        [
          escapeCSV(product.name),
          escapeCSV(product.category || ""),
          escapeCSV(product.brand || ""),
          escapeCSV(product.unit),
          escapeCSV(variant.name),
          escapeCSV(variant.sku),
          escapeCSV(variant.barcode || ""),
          escapeCSV(fromPoisha(variant.cost_price).toFixed(2)),
          escapeCSV(fromPoisha(variant.retail_price).toFixed(2)),
          escapeCSV(fromPoisha(variant.wholesale_price).toFixed(2)),
          escapeCSV(variant.tax_rate),
          escapeCSV(variant.reorder_point),
          escapeCSV(variant.current_stock ?? 0),
          escapeCSV(product.has_serials ? "yes" : "no"),
          escapeCSV(product.warranty_months),
        ].join(",")
      );
    }
  }

  return lines.join("\n");
}
