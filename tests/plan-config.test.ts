import { describe, it, expect } from "vitest";
import {
  PLANS,
  getPlanConfig,
  isFeatureAllowed,
  checkResourceLimit,
  calculateProration,
} from "@/lib/billing/plan-config";

describe("Plan Configuration & Feature Matrix", () => {
  it("enforces Free plan specifications correctly", () => {
    const free = PLANS.free;
    expect(free.limits.maxStores).toBe(1);
    expect(free.limits.maxStaff).toBe(2);
    expect(free.limits.maxProducts).toBe(200);
    expect(free.features.exportReports).toBe(false);
    expect(free.features.multiBranch).toBe(false);
    expect(free.features.serialTracking).toBe(false);
    expect(free.features.apiAccess).toBe(false);
    expect(free.features.loyaltyRewards).toBe(false);
    expect(free.features.b2bWholesale).toBe(false);
    expect(free.monthlyPriceBdt).toBe(0);
    expect(free.monthlyPricePoisha).toBe(0);
  });

  it("enforces Pro plan specifications correctly", () => {
    const pro = PLANS.pro;
    expect(pro.limits.maxStores).toBe(3);
    expect(pro.limits.maxStaff).toBe(10);
    expect(pro.limits.maxProducts).toBe(5000);
    expect(pro.features.exportReports).toBe(true);
    expect(pro.features.multiBranch).toBe(true);
    expect(pro.features.serialTracking).toBe(true);
    expect(pro.features.customBarcode).toBe(true);
    expect(pro.features.loyaltyRewards).toBe(true);
    expect(pro.features.b2bWholesale).toBe(true);
    expect(pro.features.apiAccess).toBe(false);
    expect(pro.monthlyPriceBdt).toBe(1500);
    expect(pro.monthlyPricePoisha).toBe(150000);
  });

  it("enforces Business plan specifications correctly", () => {
    const biz = PLANS.business;
    expect(biz.limits.maxStores).toBe(999);
    expect(biz.limits.maxStaff).toBe(999);
    expect(biz.limits.maxProducts).toBe(100000);
    expect(biz.features.exportReports).toBe(true);
    expect(biz.features.multiBranch).toBe(true);
    expect(biz.features.serialTracking).toBe(true);
    expect(biz.features.apiAccess).toBe(true);
    expect(biz.monthlyPriceBdt).toBe(4000);
    expect(biz.monthlyPricePoisha).toBe(400000);
  });

  it("evaluates feature flags accurately via isFeatureAllowed()", () => {
    expect(isFeatureAllowed("free", "exportReports")).toBe(false);
    expect(isFeatureAllowed("free", "serialTracking")).toBe(false);
    expect(isFeatureAllowed("pro", "exportReports")).toBe(true);
    expect(isFeatureAllowed("pro", "serialTracking")).toBe(true);
    expect(isFeatureAllowed("pro", "apiAccess")).toBe(false);
    expect(isFeatureAllowed("business", "apiAccess")).toBe(true);
  });

  it("evaluates resource limits via checkResourceLimit()", () => {
    // Free plan product limits (limit: 200)
    expect(checkResourceLimit("free", "maxProducts", 199).allowed).toBe(true);
    expect(checkResourceLimit("free", "maxProducts", 200).allowed).toBe(false);
    expect(checkResourceLimit("free", "maxProducts", 205).allowed).toBe(false);
    expect(checkResourceLimit("free", "maxProducts", 199).remaining).toBe(1);
    expect(checkResourceLimit("free", "maxProducts", 200).remaining).toBe(0);

    // Free plan staff limits (limit: 2)
    expect(checkResourceLimit("free", "maxStaff", 1).allowed).toBe(true);
    expect(checkResourceLimit("free", "maxStaff", 2).allowed).toBe(false);

    // Free plan branch/store limits (limit: 1)
    expect(checkResourceLimit("free", "maxStores", 0).allowed).toBe(true);
    expect(checkResourceLimit("free", "maxStores", 1).allowed).toBe(false);

    // Pro plan limits (3 stores, 10 staff, 5000 products)
    expect(checkResourceLimit("pro", "maxStores", 2).allowed).toBe(true);
    expect(checkResourceLimit("pro", "maxStores", 3).allowed).toBe(false);
    expect(checkResourceLimit("pro", "maxStaff", 9).allowed).toBe(true);
    expect(checkResourceLimit("pro", "maxStaff", 10).allowed).toBe(false);
    expect(checkResourceLimit("pro", "maxProducts", 4999).allowed).toBe(true);
    expect(checkResourceLimit("pro", "maxProducts", 5000).allowed).toBe(false);
  });
});

describe("Subscription Proration Mathematics", () => {
  it("calculates exact proration when upgrading mid-month with positive net payable", () => {
    // Upgrading from Pro (150,000 poisha) to Business (400,000 poisha) with 15 days left out of 30
    const proration = calculateProration("pro", "business", "month", 15, 30);
    // Unused credit on Pro = 150000 * (15/30) = 75000 poisha
    // New cost on Business = 400000 * (15/30) = 200000 poisha
    // Net payable = 200000 - 75000 = 125000 poisha (৳1,250.00)
    expect(proration.unusedCurrentCreditPoisha).toBe(75000);
    expect(proration.newPlanCostPoisha).toBe(200000);
    expect(proration.netPayablePoisha).toBe(125000);
    expect(proration.daysRemaining).toBe(15);
  });

  it("handles free to paid upgrades with 0 credit", () => {
    // Upgrading from Free to Pro with 20 days left out of 30
    const proration = calculateProration("free", "pro", "month", 20, 30);
    expect(proration.unusedCurrentCreditPoisha).toBe(0);
    // New cost = 150000 * (20/30) = 100000 poisha
    expect(proration.newPlanCostPoisha).toBe(100000);
    expect(proration.netPayablePoisha).toBe(100000);
  });

  it("returns zero net payable on downgrade", () => {
    // Downgrading from Business to Pro mid-period
    const proration = calculateProration("business", "pro", "month", 15, 30);
    expect(proration.unusedCurrentCreditPoisha).toBe(200000);
    expect(proration.newPlanCostPoisha).toBe(75000);
    // Net payable cannot be negative; remaining credit is held/documented
    expect(proration.netPayablePoisha).toBe(0);
  });

  it("handles edge cases: 0 days remaining or same day renewal", () => {
    const proration = calculateProration("pro", "business", "month", 0, 30);
    expect(proration.unusedCurrentCreditPoisha).toBe(0);
    expect(proration.newPlanCostPoisha).toBe(400000);
    expect(proration.netPayablePoisha).toBe(400000);
  });

  it("handles full-period upgrade (30 days remaining)", () => {
    const proration = calculateProration("pro", "business", "month", 30, 30);
    expect(proration.unusedCurrentCreditPoisha).toBe(150000);
    expect(proration.newPlanCostPoisha).toBe(400000);
    expect(proration.netPayablePoisha).toBe(250000);
  });
});
