import { describe, it, expect } from "vitest";
import {
  evaluateSubscriptionLifecycle,
  SubscriptionSnapshot,
} from "@/lib/billing/lifecycle";

describe("Subscription Lifecycle State Machine", () => {
  const baseSub: SubscriptionSnapshot = {
    id: "sub-123",
    tenantId: "tenant-abc",
    planTier: "free",
    status: "trialing",
    currentPeriodStart: new Date("2026-10-01T00:00:00Z").toISOString(),
    currentPeriodEnd: null,
    trialEndsAt: new Date("2026-10-15T00:00:00Z").toISOString(),
    gracePeriodEndsAt: null,
    cancelAtPeriodEnd: false,
  };

  it("evaluates active trial with remaining days", () => {
    // Current date is 5 days into trial
    const now = new Date("2026-10-06T00:00:00Z");
    const evaluation = evaluateSubscriptionLifecycle(baseSub, now);

    expect(evaluation.status).toBe("trialing");
    expect(evaluation.isReadOnly).toBe(false);
    expect(evaluation.canWrite).toBe(true);
    expect(evaluation.inGracePeriod).toBe(false);
    expect(evaluation.daysRemaining).toBe(9);
    expect(evaluation.canUpgrade).toBe(true);
    expect(evaluation.statusMessage).toContain("9 days remaining");
  });

  it("evaluates active paid subscription in good standing", () => {
    const paidSub: SubscriptionSnapshot = {
      ...baseSub,
      planTier: "pro",
      status: "active",
      currentPeriodStart: new Date("2026-10-01T00:00:00Z").toISOString(),
      currentPeriodEnd: new Date("2026-10-31T00:00:00Z").toISOString(),
      trialEndsAt: null,
    };

    const now = new Date("2026-10-11T00:00:00Z");
    const evaluation = evaluateSubscriptionLifecycle(paidSub, now);

    expect(evaluation.status).toBe("active");
    expect(evaluation.isReadOnly).toBe(false);
    expect(evaluation.canWrite).toBe(true);
    expect(evaluation.inGracePeriod).toBe(false);
    expect(evaluation.daysRemaining).toBe(20);
    expect(evaluation.canUpgrade).toBe(true);
  });

  it("evaluates past_due tenant inside the 7-day grace period (writes allowed)", () => {
    const pastDueSub: SubscriptionSnapshot = {
      ...baseSub,
      planTier: "pro",
      status: "past_due",
      currentPeriodStart: new Date("2026-09-01T00:00:00Z").toISOString(),
      currentPeriodEnd: new Date("2026-10-01T00:00:00Z").toISOString(),
      gracePeriodEndsAt: new Date("2026-10-08T00:00:00Z").toISOString(),
    };

    // On Oct 4, 4 days remaining of grace period
    const now = new Date("2026-10-04T00:00:00Z");
    const evaluation = evaluateSubscriptionLifecycle(pastDueSub, now);

    expect(evaluation.status).toBe("past_due");
    expect(evaluation.inGracePeriod).toBe(true);
    expect(evaluation.isReadOnly).toBe(false); // Can still conduct POS sales during grace period
    expect(evaluation.canWrite).toBe(true);
    expect(evaluation.daysRemaining).toBe(4);
    expect(evaluation.statusMessage).toContain("grace period active");
  });

  it("evaluates past_due tenant after 7-day grace period expires (read-only mode enforced)", () => {
    const pastDueExpiredSub: SubscriptionSnapshot = {
      ...baseSub,
      planTier: "pro",
      status: "past_due",
      currentPeriodStart: new Date("2026-09-01T00:00:00Z").toISOString(),
      currentPeriodEnd: new Date("2026-10-01T00:00:00Z").toISOString(),
      gracePeriodEndsAt: new Date("2026-10-08T00:00:00Z").toISOString(),
    };

    // On Oct 10, grace period has expired
    const now = new Date("2026-10-10T00:00:00Z");
    const evaluation = evaluateSubscriptionLifecycle(pastDueExpiredSub, now);

    expect(evaluation.status).toBe("past_due");
    expect(evaluation.inGracePeriod).toBe(false);
    expect(evaluation.isReadOnly).toBe(true); // STRICT READ-ONLY MODE
    expect(evaluation.canWrite).toBe(false); // Blocked from creating new products or sales
    expect(evaluation.daysRemaining).toBe(0);
    expect(evaluation.canUpgrade).toBe(true); // Still allowed to pay and restore
    expect(evaluation.statusMessage).toContain("read-only mode");
  });

  it("evaluates canceled subscription with remaining time in paid billing cycle", () => {
    const canceledSub: SubscriptionSnapshot = {
      ...baseSub,
      planTier: "business",
      status: "canceled",
      cancelAtPeriodEnd: true,
      currentPeriodStart: new Date("2026-10-01T00:00:00Z").toISOString(),
      currentPeriodEnd: new Date("2026-10-31T00:00:00Z").toISOString(),
    };

    const now = new Date("2026-10-20T00:00:00Z");
    const evaluation = evaluateSubscriptionLifecycle(canceledSub, now);

    expect(evaluation.status).toBe("canceled");
    expect(evaluation.isReadOnly).toBe(false);
    expect(evaluation.canWrite).toBe(true);
    expect(evaluation.daysRemaining).toBe(11);
    expect(evaluation.statusMessage).toContain("Access remains active until");
  });

  it("evaluates canceled subscription after billing period ends (read-only mode enforced, data preserved)", () => {
    const canceledEndedSub: SubscriptionSnapshot = {
      ...baseSub,
      planTier: "business",
      status: "canceled",
      cancelAtPeriodEnd: true,
      currentPeriodStart: new Date("2026-09-01T00:00:00Z").toISOString(),
      currentPeriodEnd: new Date("2026-09-30T00:00:00Z").toISOString(),
    };

    const now = new Date("2026-10-15T00:00:00Z");
    const evaluation = evaluateSubscriptionLifecycle(canceledEndedSub, now);

    expect(evaluation.status).toBe("canceled");
    expect(evaluation.isReadOnly).toBe(true);
    expect(evaluation.canWrite).toBe(false);
    expect(evaluation.daysRemaining).toBe(0);
    expect(evaluation.statusMessage).toContain("read-only mode");
  });

  it("evaluates free tier after trial completes (standard free plan active)", () => {
    const freePostTrial: SubscriptionSnapshot = {
      ...baseSub,
      planTier: "free",
      status: "active",
      trialEndsAt: new Date("2026-10-01T00:00:00Z").toISOString(),
      currentPeriodEnd: null,
    };

    const now = new Date("2026-10-22T00:00:00Z");
    const evaluation = evaluateSubscriptionLifecycle(freePostTrial, now);

    expect(evaluation.status).toBe("active");
    expect(evaluation.isReadOnly).toBe(false);
    expect(evaluation.canWrite).toBe(true);
    expect(evaluation.canUpgrade).toBe(true);
  });
});
