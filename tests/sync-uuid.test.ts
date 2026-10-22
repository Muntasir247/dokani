import { describe, it, expect } from "vitest";
import { generateUUIDv7, isValidUUIDv7 } from "@/lib/offline/uuidv7";

describe("UUID v7 Monotonicity & Specification Validation", () => {
  it("generates valid RFC 9562 UUID v7 strings", () => {
    const id = generateUUIDv7();
    expect(isValidUUIDv7(id)).toBe(true);
    // Version nibble (13th char) should be 7
    expect(id.charAt(14)).toBe("7");
    // Variant nibble (17th char) should be 8, 9, a, or b
    expect(["8", "9", "a", "b"]).toContain(id.charAt(19).toLowerCase());
  });

  it("produces monotonically sortable IDs over time", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      ids.push(generateUUIDv7());
      // small delay between generates
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it("handles rapid burst generation without collisions", () => {
    const count = 500;
    const set = new Set<string>();
    for (let i = 0; i < count; i++) {
      const id = generateUUIDv7();
      expect(isValidUUIDv7(id)).toBe(true);
      set.add(id);
    }
    expect(set.size).toBe(count);
  });
});
