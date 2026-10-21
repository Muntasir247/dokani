import { describe, it, expect } from "vitest";
import {
  calculateEAN13CheckDigit,
  isValidEAN13,
  generateInternalEAN13,
  generateSKU,
  isValidBarcode,
} from "@/lib/barcodes";

describe("Barcode & SKU Generation & Validation", () => {
  it("calculates exact GS1 EAN-13 check digit for standard test barcodes", () => {
    // Official GS1 sample barcodes:
    // 4006381333931 -> first 12: 400638133393 -> check digit 1
    expect(calculateEAN13CheckDigit("400638133393")).toBe(1);

    // 9780201379624 -> first 12: 978020137962 -> check digit 4
    expect(calculateEAN13CheckDigit("978020137962")).toBe(4);

    // 5901234123457 -> first 12: 590123412345 -> check digit 7
    expect(calculateEAN13CheckDigit("590123412345")).toBe(7);
  });

  it("validates correct and incorrect EAN-13 barcodes", () => {
    expect(isValidEAN13("4006381333931")).toBe(true);
    expect(isValidEAN13("9780201379624")).toBe(true);

    // Corrupted check digit
    expect(isValidEAN13("4006381333932")).toBe(false);
    expect(isValidEAN13("9780201379620")).toBe(false);

    // Invalid length
    expect(isValidEAN13("12345")).toBe(false);
    expect(isValidEAN13("12345678901234")).toBe(false);
  });

  it("generates valid internal EAN-13 barcodes with default 200 prefix", () => {
    for (let i = 0; i < 20; i++) {
      const generated = generateInternalEAN13();
      expect(generated.length).toBe(13);
      expect(generated.startsWith("200")).toBe(true);
      expect(isValidEAN13(generated)).toBe(true);
      expect(isValidBarcode(generated)).toBe(true);
    }
  });

  it("generates formatted SKUs with prefix and category code", () => {
    const sku = generateSKU("DOK", "ELEC");
    expect(sku.startsWith("DOK-ELEC-")).toBe(true);
    expect(sku.length).toBe(15);
  });

  it("validates alphanumeric Code128 barcodes", () => {
    expect(isValidBarcode("ANKER-737-BLK")).toBe(true);
    expect(isValidBarcode("SHIRT-SLIM-XL")).toBe(true);
    expect(isValidBarcode("")).toBe(false);
    expect(isValidBarcode("AB")).toBe(false); // too short
  });
});
