import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  parseBulkSerials,
  transitionSerialStatus,
  SerialEntity,
} from "@/lib/inventory/serials";

describe("Product Serials Tracking & Single-Sale Enforcement", () => {
  const migration5Path = path.resolve(
    __dirname,
    "../supabase/migrations/20261022000005_catalog_and_inventory.sql"
  );
  const migration5Content = fs.readFileSync(migration5Path, "utf-8");

  it("verifies the database migration defines the single-sale trigger and function", () => {
    expect(migration5Content.includes("fn_check_serial_sale_rules")).toBe(true);
    expect(migration5Content.includes("trg_check_serial_sale_rules")).toBe(true);
    expect(migration5Content.includes("Serial number % is already sold and cannot be sold again")).toBe(true);
    expect(migration5Content.includes("Serial number % was previously sold and cannot be sold twice")).toBe(true);
  });

  it("acceptance criteria: a serial can never be sold twice", () => {
    const serial: SerialEntity = {
      tenant_id: "tenant-1",
      variant_id: "var-macbook",
      stock_location_id: "loc-main",
      serial_number: "C02G1234MD6R",
      status: "available",
      warranty_months: 12,
      times_sold: 0,
      sold_at: null,
    };

    // First sale: transitions from 'available' to 'sold' successfully
    const soldFirstTime = transitionSerialStatus(serial, "sold");
    expect(soldFirstTime.status).toBe("sold");
    expect(soldFirstTime.times_sold).toBe(1);
    expect(soldFirstTime.sold_at).toBeDefined();

    // Attempting to sell again while status is already 'sold' throws an error
    expect(() => {
      transitionSerialStatus(soldFirstTime, "sold");
    }).toThrow(/already sold and cannot be sold again/i);

    // If customer returns it, status becomes 'returned'
    const returnedSerial = transitionSerialStatus(soldFirstTime, "returned");
    expect(returnedSerial.status).toBe("returned");
    expect(returnedSerial.times_sold).toBe(1); // record of previous sale remains

    // Attempting to sell the returned serial again directly throws an error
    expect(() => {
      transitionSerialStatus(returnedSerial, "sold");
    }).toThrow(/was previously sold and cannot be sold twice/i);
  });

  it("parses bulk serial inputs from multiline scan or comma-separated lists", () => {
    const rawInput = `
      SN-1001, SN-1002, SN-1003
      SN-1004
      SN-1005; SN-1006
      SN-1002
    `;

    const result = parseBulkSerials(rawInput);
    expect(result.serials).toEqual([
      "SN-1001",
      "SN-1002",
      "SN-1003",
      "SN-1004",
      "SN-1005",
      "SN-1006",
    ]);
    expect(result.duplicatesInBatch).toEqual(["SN-1002"]);
    expect(result.totalParsed).toBe(7);
  });

  it("handles empty or whitespace bulk serial input gracefully", () => {
    expect(parseBulkSerials("").serials).toEqual([]);
    expect(parseBulkSerials("   \n\n  ").serials).toEqual([]);
  });
});
