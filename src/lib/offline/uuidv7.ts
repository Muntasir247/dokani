/**
 * Pure TypeScript RFC 9562-compliant UUID v7 generator.
 *
 * Layout:
 *  - 48 bits: Unix timestamp in milliseconds
 *  - 4 bits: Version 7 (0b0111)
 *  - 12 bits: Pseudorandom counter/bits (rand_a)
 *  - 2 bits: Variant 2 (0b10)
 *  - 62 bits: Pseudorandom bits (rand_b)
 *
 * Guarantees:
 *  - Monotonically sortable by generation timestamp
 *  - Minimizes B-tree index fragmentation in Postgres & IndexedDB
 *  - Compatible with browser and Node.js environments via globalThis.crypto
 */
let lastTimestamp = 0;
let seqCounter = 0;

export function generateUUIDv7(): string {
  let now = Date.now();

  if (now <= lastTimestamp) {
    now = lastTimestamp;
    seqCounter = (seqCounter + 1) & 0x0fff;
    if (seqCounter === 0) {
      // If counter rolls over in the same ms, step timestamp forward by 1ms
      now = lastTimestamp + 1;
    }
  } else {
    // New millisecond: reset counter with random seed in lower range to leave headroom
    seqCounter = Math.floor(Math.random() * 0x0200);
  }
  lastTimestamp = now;

  // 48 bits of timestamp
  const timestampHex = now.toString(16).padStart(12, "0");

  // Random bytes for variant and rand_b
  const randomBytes = new Uint8Array(8);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 8; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // 12 bits of monotonic counter + version 7 (0b0111)
  const randA = seqCounter & 0x0fff;
  const verAndRandA = (0x7000 | randA).toString(16).padStart(4, "0");

  // 2 bits of variant 2 (0b10) + 62 bits of rand_b
  const varAndRandB = ((0x80 | (randomBytes[0] & 0x3f)) << 8) | randomBytes[1];
  const varAndRandBHex = varAndRandB.toString(16).padStart(4, "0");
  const randCRest = Array.from(randomBytes.slice(2))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-${verAndRandA}-${varAndRandBHex}-${randCRest}`;
}

export function isValidUUIDv7(uuid: string): boolean {
  if (typeof uuid !== "string") return false;
  const v7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return v7Regex.test(uuid);
}
