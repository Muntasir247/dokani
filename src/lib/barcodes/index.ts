/**
 * Dokani Barcode Generation & Validation Utility
 * Supports standard EAN-13 (with official Modulo-10 check digit) and Code-128
 */

/**
 * Calculates the standard EAN-13 check digit for a 12-digit string.
 * Uses the alternating 1x and 3x weight algorithm mod 10.
 */
export function calculateEAN13CheckDigit(twelveDigits: string): number {
  if (!/^\d{12}$/.test(twelveDigits)) {
    throw new Error("EAN-13 check digit calculation requires exactly 12 numeric digits.");
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(twelveDigits[i], 10);
    // Even index in 0-based array is odd position (1st, 3rd, 5th...) -> weight 1
    // Odd index in 0-based array is even position (2nd, 4th, 6th...) -> weight 3
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Validates whether a given string is a valid 13-digit EAN-13 barcode with correct check digit.
 */
export function isValidEAN13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) {
    return false;
  }
  const body = barcode.slice(0, 12);
  const expectedCheckDigit = calculateEAN13CheckDigit(body);
  const actualCheckDigit = parseInt(barcode[12], 10);
  return expectedCheckDigit === actualCheckDigit;
}

/**
 * Generates an internal store EAN-13 barcode.
 * Standard retail GS1 prefix "20" - "29" is designated for internal restricted store circulation.
 * Prefix default: "200" followed by 9 randomized/counter digits + 1 check digit.
 */
export function generateInternalEAN13(prefix: string = "200"): string {
  const sanitizedPrefix = prefix.replace(/\D/g, "").slice(0, 4) || "200";
  const digitsNeeded = 12 - sanitizedPrefix.length;

  let randomPart = "";
  for (let i = 0; i < digitsNeeded; i++) {
    randomPart += Math.floor(Math.random() * 10).toString();
  }

  const twelveDigits = `${sanitizedPrefix}${randomPart}`;
  const checkDigit = calculateEAN13CheckDigit(twelveDigits);

  return `${twelveDigits}${checkDigit}`;
}

/**
 * Generates a clean internal SKU code: e.g. DOK-CAT-10492
 */
export function generateSKU(prefix: string = "DOK", categoryCode?: string): string {
  const cleanPrefix = (prefix || "DOK").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  const cleanCategory = (categoryCode || "ITM").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `${cleanPrefix}-${cleanCategory}-${randomSuffix}`;
}

/**
 * Validates a barcode string (supports EAN-13, EAN-8, UPC-A, Code128 alphanumeric 3-32 chars).
 */
export function isValidBarcode(barcode: string): boolean {
  if (!barcode || typeof barcode !== "string") return false;
  const trimmed = barcode.trim();
  if (trimmed.length < 3 || trimmed.length > 50) return false;

  // If 13 digits, must strictly conform to EAN-13 checksum
  if (/^\d{13}$/.test(trimmed)) {
    return isValidEAN13(trimmed);
  }

  // General barcode characters (alphanumeric + standard barcode symbols)
  return /^[A-Za-z0-9\-_./]+$/.test(trimmed);
}
