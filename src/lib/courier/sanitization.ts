/**
 * Payload Sanitization & Bangladeshi Phone Number Normalization
 * for Courier Parcel Creation (Steadfast, Pathao)
 */

export interface SanitizedCourierPayload {
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  codAmountBdt: number;
}

/**
 * Normalizes a Bangladeshi mobile number to standard 11-digit format (e.g. 017XXXXXXXX).
 * Accepts +8801..., 8801..., 01..., with spaces, hyphens, or parentheses.
 */
export function normalizeBangladeshPhone(rawPhone: string): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  if (!rawPhone || typeof rawPhone !== "string") {
    return { isValid: false, normalized: "", error: "Phone number is required" };
  }

  // Strip all non-digit characters except leading plus
  let cleaned = rawPhone.trim().replace(/[^\d+]/g, "");

  // If starts with +880 or 880, strip prefix
  if (cleaned.startsWith("+880")) {
    cleaned = "0" + cleaned.slice(4);
  } else if (cleaned.startsWith("880")) {
    cleaned = "0" + cleaned.slice(3);
  }

  // Must be 11 digits starting with 01
  if (!/^01[3-9]\d{8}$/.test(cleaned)) {
    return {
      isValid: false,
      normalized: cleaned,
      error: `Invalid Bangladeshi mobile number: "${rawPhone}". Must be 11 digits starting with 013-019.`,
    };
  }

  return { isValid: true, normalized: cleaned };
}

/**
 * Sanitizes courier payload to protect upstream API calls from injection and formatting rejections.
 */
export function sanitizeCourierPayload(input: {
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  codAmountBdt?: number;
}): SanitizedCourierPayload {
  // 1. Sanitize Recipient Name
  const cleanName = (input.recipientName || "Customer")
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, "") // remove control characters
    .slice(0, 100);

  // 2. Validate and Normalize Phone
  const phoneResult = normalizeBangladeshPhone(input.recipientPhone);
  if (!phoneResult.isValid) {
    throw new Error(phoneResult.error || "Invalid recipient phone number");
  }

  // 3. Sanitize Address
  const cleanAddress = (input.recipientAddress || "")
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, "")
    .slice(0, 250);

  if (cleanAddress.length < 5) {
    throw new Error("Recipient address is too short. Please provide a detailed delivery address.");
  }

  // 4. Sanitize COD Amount
  const codBdt = Math.max(0, Math.round(input.codAmountBdt || 0));

  return {
    recipientName: cleanName,
    recipientPhone: phoneResult.normalized,
    recipientAddress: cleanAddress,
    codAmountBdt: codBdt,
  };
}

export function sanitizeBDPhone(phone: string): string {
  const result = normalizeBangladeshPhone(phone);
  return result.isValid ? result.normalized : phone.replace(/[^\d]/g, "");
}

export function sanitizeRecipientName(name: string): string {
  return (name || "Customer").trim().replace(/[\x00-\x1F\x7F]/g, "").slice(0, 100);
}

export function sanitizeDeliveryAddress(address: string): string {
  return (address || "")
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 250);
}
