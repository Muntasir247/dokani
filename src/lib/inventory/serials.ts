import { SerialStatus } from "@/types/database.types";

export interface SerialEntity {
  id?: string;
  tenant_id: string;
  variant_id: string;
  stock_location_id: string;
  serial_number: string;
  status: SerialStatus;
  warranty_months: number;
  times_sold: number;
  sold_at?: string | null;
}

/**
 * Parses bulk serial input (copy-pasted from supplier invoice, scanned barcode list, etc.)
 * Supports newlines, commas, tabs, and spaces.
 * Deduplicates within the batch and filters empty entries.
 */
export function parseBulkSerials(rawInput: string): {
  serials: string[];
  duplicatesInBatch: string[];
  totalParsed: number;
} {
  if (!rawInput || typeof rawInput !== "string") {
    return { serials: [], duplicatesInBatch: [], totalParsed: 0 };
  }

  // Split by newlines, commas, semicolons, tabs, or whitespace
  const rawTokens = rawInput
    .split(/[\r\n,;\t]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const seen = new Set<string>();
  const serials: string[] = [];
  const duplicatesInBatch: string[] = [];

  for (const token of rawTokens) {
    if (seen.has(token)) {
      if (!duplicatesInBatch.includes(token)) {
        duplicatesInBatch.push(token);
      }
    } else {
      seen.add(token);
      serials.push(token);
    }
  }

  return {
    serials,
    duplicatesInBatch,
    totalParsed: rawTokens.length,
  };
}

/**
 * Simulates and enforces the database-level single-sale invariant for serial numbers.
 * A serial can NEVER be sold twice.
 */
export function transitionSerialStatus(
  current: SerialEntity,
  targetStatus: SerialStatus,
  soldTimestamp: string = new Date().toISOString()
): SerialEntity {
  if (targetStatus === "sold") {
    if (current.status === "sold") {
      throw new Error(`Serial number ${current.serial_number} is already sold and cannot be sold again.`);
    }
    if (current.times_sold > 0) {
      throw new Error(`Serial number ${current.serial_number} was previously sold and cannot be sold twice.`);
    }

    return {
      ...current,
      status: "sold",
      times_sold: current.times_sold + 1,
      sold_at: soldTimestamp,
    };
  }

  return {
    ...current,
    status: targetStatus,
  };
}
