import { describe, it, expect } from "vitest";
import {
  toPoisha,
  toTaka,
  formatBDT,
  calculateTax,
  calculateDiscountPercent,
  sumPoisha,
} from "./index";

describe("Money Utilities (Minor Unit Poisha)", () => {
  describe("toPoisha", () => {
    it("converts whole Taka numbers correctly", () => {
      expect(toPoisha(100)).toBe(10000);
      expect(toPoisha(0)).toBe(0);
    });

    it("converts decimal Taka numbers without floating point errors", () => {
      expect(toPoisha(120.5)).toBe(12050);
      expect(toPoisha(99.99)).toBe(9999);
      expect(toPoisha(0.01)).toBe(1);
    });

    it("converts string inputs safely", () => {
      expect(toPoisha("1500.75")).toBe(150075);
      expect(toPoisha("0.50")).toBe(50);
    });

    it("throws error for invalid non-numeric strings", () => {
      expect(() => toPoisha("invalid")).toThrow();
    });
  });

  describe("toTaka", () => {
    it("converts integer Poisha back to decimal Taka", () => {
      expect(toTaka(10000)).toBe(100);
      expect(toTaka(12050)).toBe(120.5);
      expect(toTaka(1)).toBe(0.01);
      expect(toTaka(0)).toBe(0);
    });

    it("throws error if input is not an integer", () => {
      expect(() => toTaka(100.5)).toThrow(/integer/);
    });
  });

  describe("formatBDT", () => {
    it("formats poisha amounts with currency symbol ৳ and decimals", () => {
      expect(formatBDT(165000)).toBe("৳ 1,650.00");
      expect(formatBDT(50)).toBe("৳ 0.50");
      expect(formatBDT(0)).toBe("৳ 0.00");
    });

    it("can format without the currency symbol", () => {
      expect(formatBDT(165000, { showSymbol: false })).toBe("1,650.00");
    });
  });

  describe("calculateTax", () => {
    it("calculates exact tax in poisha with integer rounding", () => {
      // 5% of 100 BDT (10000 poisha) = 500 poisha (5 BDT)
      expect(calculateTax(10000, 5.0)).toBe(500);
      // 7.5% of 1500 BDT (150000 poisha) = 11250 poisha (112.50 BDT)
      expect(calculateTax(150000, 7.5)).toBe(11250);
      // 15% VAT on 333 poisha = 49.95 -> 50 poisha
      expect(calculateTax(333, 15)).toBe(50);
    });

    it("throws for negative subtotal or tax rate", () => {
      expect(() => calculateTax(-100, 5)).toThrow();
      expect(() => calculateTax(100, -5)).toThrow();
    });
  });

  describe("calculateDiscountPercent", () => {
    it("calculates percentage discount accurately in poisha", () => {
      // 10% discount on 200 BDT (20000 poisha) = 2000 poisha (20 BDT)
      expect(calculateDiscountPercent(20000, 10)).toBe(2000);
      // 100% discount
      expect(calculateDiscountPercent(20000, 100)).toBe(20000);
      // 0% discount
      expect(calculateDiscountPercent(20000, 0)).toBe(0);
    });

    it("throws for invalid discount percentages", () => {
      expect(() => calculateDiscountPercent(1000, -1)).toThrow();
      expect(() => calculateDiscountPercent(1000, 105)).toThrow();
    });
  });

  describe("sumPoisha", () => {
    it("sums multiple integer poisha amounts", () => {
      expect(sumPoisha(100, 200, 300)).toBe(600);
      expect(sumPoisha(120000, 45000, -5000)).toBe(160000);
    });

    it("throws if any value is not an integer", () => {
      expect(() => sumPoisha(100, 200.5)).toThrow(/integer/);
    });
  });
});
