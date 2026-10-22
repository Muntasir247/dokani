import { describe, it, expect } from "vitest";
import {
  calculateLoyaltyPointsEarned,
  calculateLoyaltyRedemptionDiscount,
  calculateMaxRedeemablePoints,
  validateLoyaltyRedemption,
  LoyaltyConfig,
} from "@/lib/customers/loyalty";

describe("Customer Loyalty Program Math & Rules", () => {
  const defaultConfig: LoyaltyConfig = {
    enabled: true,
    earnRatePoisha: 1000, // 10 BDT spent = 1 point
    redeemRatePoisha: 100, // 1 point = 1 BDT discount (100 poisha)
  };

  describe("calculateLoyaltyPointsEarned", () => {
    it("earns points strictly based on earn rate (10 BDT = 1 point)", () => {
      // 100 BDT = 10,000 poisha -> 10 points
      expect(calculateLoyaltyPointsEarned(10000, 1000, true)).toBe(10);

      // 95 BDT = 9,500 poisha -> 9 points (floored)
      expect(calculateLoyaltyPointsEarned(9500, 1000, true)).toBe(9);

      // 9 BDT = 900 poisha -> 0 points
      expect(calculateLoyaltyPointsEarned(900, 1000, true)).toBe(0);
    });

    it("returns 0 points when loyalty program is disabled", () => {
      expect(calculateLoyaltyPointsEarned(50000, 1000, false)).toBe(0);
    });

    it("handles zero or negative paid amounts safely", () => {
      expect(calculateLoyaltyPointsEarned(0, 1000, true)).toBe(0);
      expect(calculateLoyaltyPointsEarned(-5000, 1000, true)).toBe(0);
    });

    it("handles zero or invalid earn rate safely", () => {
      expect(calculateLoyaltyPointsEarned(10000, 0, true)).toBe(0);
      expect(calculateLoyaltyPointsEarned(10000, -100, true)).toBe(0);
    });
  });

  describe("calculateLoyaltyRedemptionDiscount", () => {
    it("calculates exact discount value in poisha", () => {
      // 50 points * 100 poisha/point = 5,000 poisha (50 BDT)
      expect(calculateLoyaltyRedemptionDiscount(50, 100)).toBe(5000);

      // 1 point * 100 poisha = 100 poisha (1 BDT)
      expect(calculateLoyaltyRedemptionDiscount(1, 100)).toBe(100);
    });

    it("returns 0 when points or redeem rate is zero/negative", () => {
      expect(calculateLoyaltyRedemptionDiscount(0, 100)).toBe(0);
      expect(calculateLoyaltyRedemptionDiscount(-10, 100)).toBe(0);
      expect(calculateLoyaltyRedemptionDiscount(10, 0)).toBe(0);
    });
  });

  describe("calculateMaxRedeemablePoints", () => {
    it("caps redeemable points by available customer points", () => {
      // Bill is 10,000 poisha (needs 100 pts), but customer only has 40 pts
      const maxPts = calculateMaxRedeemablePoints(40, 10000, 100, true);
      expect(maxPts).toBe(40);
    });

    it("caps redeemable points by total bill value so discount cannot exceed total", () => {
      // Customer has 500 pts (worth 50,000 poisha), but bill is only 15,000 poisha (150 pts needed)
      const maxPts = calculateMaxRedeemablePoints(500, 15000, 100, true);
      expect(maxPts).toBe(150);
    });

    it("returns 0 if program is disabled or bill is 0", () => {
      expect(calculateMaxRedeemablePoints(100, 10000, 100, false)).toBe(0);
      expect(calculateMaxRedeemablePoints(100, 0, 100, true)).toBe(0);
    });
  });

  describe("validateLoyaltyRedemption", () => {
    it("validates successful redemption within balance and bill limits", () => {
      const result = validateLoyaltyRedemption(50, 30, 5000, defaultConfig);
      expect(result.valid).toBe(true);
      expect(result.discountPoisha).toBe(3000);
      expect(result.pointsToDeduct).toBe(30);
    });

    it("rejects redemption exceeding available customer points", () => {
      const result = validateLoyaltyRedemption(20, 50, 10000, defaultConfig);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Customer has only 20 points available");
    });

    it("rejects redemption where discount value exceeds order total", () => {
      // 50 points = 5,000 poisha discount, but order total is only 3,000 poisha
      const result = validateLoyaltyRedemption(100, 50, 3000, defaultConfig);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds order total");
    });

    it("rejects redemption if loyalty is disabled on the store", () => {
      const disabledConfig: LoyaltyConfig = { ...defaultConfig, enabled: false };
      const result = validateLoyaltyRedemption(100, 10, 5000, disabledConfig);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not enabled");
    });

    it("accepts zero points redemption as a no-op", () => {
      const result = validateLoyaltyRedemption(100, 0, 5000, defaultConfig);
      expect(result.valid).toBe(true);
      expect(result.discountPoisha).toBe(0);
      expect(result.pointsToDeduct).toBe(0);
    });
  });
});
