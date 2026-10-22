/**
 * Subscription Lifecycle State Machine
 *
 * Implements pure state evaluation for tenant subscription lifecycles:
 * trial (14 days) -> active -> past_due (7 days grace) -> read_only (never deletes data) -> canceled.
 */

import { PlanTier } from "@/types/database.types";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface SubscriptionSnapshot {
  id: string;
  tenantId: string;
  planTier: PlanTier;
  status: string; // from db
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionStateEvaluation {
  /** Effective evaluated status */
  status: SubscriptionStatus;
  /** Whether the account is locked in read-only mode (all writes blocked) */
  isReadOnly: boolean;
  /** Whether the account is currently in the 7-day grace period */
  inGracePeriod: boolean;
  /** Remaining days of trial, active period, or grace period */
  daysRemaining: number;
  /** Human-readable status banner message */
  statusMessage: string;
  /** Whether upgrading is suggested */
  canUpgrade: boolean;
  /** Whether writes (creating products, sales, branches) are allowed */
  canWrite: boolean;
}

/**
 * Evaluates the real-time operational status of a subscription snapshot.
 * Pure function with zero external side effects, making it 100% deterministic and unit-testable.
 */
export function evaluateSubscriptionLifecycle(
  sub: SubscriptionSnapshot,
  now: Date = new Date()
): SubscriptionStateEvaluation {
  const currentTime = now.getTime();
  const trialEnd = sub.trialEndsAt ? new Date(sub.trialEndsAt).getTime() : null;
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null;
  const graceEnd = sub.gracePeriodEndsAt ? new Date(sub.gracePeriodEndsAt).getTime() : null;

  // 1. Trialing Status
  if (sub.status === "trialing" || (sub.planTier === "free" && trialEnd && currentTime < trialEnd)) {
    if (trialEnd && currentTime < trialEnd) {
      const daysLeft = Math.ceil((trialEnd - currentTime) / (1000 * 60 * 60 * 24));
      return {
        status: "trialing",
        isReadOnly: false,
        inGracePeriod: false,
        daysRemaining: Math.max(0, daysLeft),
        statusMessage: `Trial active — ${daysLeft} days remaining. Full features unlocked.`,
        canUpgrade: true,
        canWrite: true,
      };
    }
  }

  // 2. Canceled Status
  if (sub.status === "canceled" || sub.cancelAtPeriodEnd) {
    if (periodEnd && currentTime < periodEnd) {
      const daysLeft = Math.ceil((periodEnd - currentTime) / (1000 * 60 * 60 * 24));
      return {
        status: "canceled",
        isReadOnly: false,
        inGracePeriod: false,
        daysRemaining: Math.max(0, daysLeft),
        statusMessage: `Subscription canceled. Access remains active until ${new Date(periodEnd).toLocaleDateString("en-GB")}.`,
        canUpgrade: true,
        canWrite: true,
      };
    } else {
      // Period has passed -> read-only
      return {
        status: "canceled",
        isReadOnly: true,
        inGracePeriod: false,
        daysRemaining: 0,
        statusMessage: "Subscription canceled and period ended. Your data is preserved in read-only mode.",
        canUpgrade: true,
        canWrite: false,
      };
    }
  }

  // 3. Past Due Status & Grace Period
  if (sub.status === "past_due") {
    if (graceEnd && currentTime < graceEnd) {
      const graceDaysLeft = Math.ceil((graceEnd - currentTime) / (1000 * 60 * 60 * 24));
      return {
        status: "past_due",
        isReadOnly: false, // write access maintained during 7-day grace period
        inGracePeriod: true,
        daysRemaining: Math.max(0, graceDaysLeft),
        statusMessage: `Payment failed. 7-day grace period active (${graceDaysLeft} days remaining). Please update payment to avoid service lock.`,
        canUpgrade: true,
        canWrite: true,
      };
    } else {
      // Grace period expired -> locked in read-only mode, data NEVER deleted
      return {
        status: "past_due",
        isReadOnly: true,
        inGracePeriod: false,
        daysRemaining: 0,
        statusMessage: "Payment past due and grace period has expired. Account is in read-only mode. Data is preserved.",
        canUpgrade: true,
        canWrite: false,
      };
    }
  }

  // 4. Free Tier Post-Trial
  if (sub.planTier === "free" && trialEnd && currentTime >= trialEnd && !periodEnd) {
    // If free tier trial ended, stay on standard free limits (not read-only, but bounded by free limits)
    return {
      status: "active",
      isReadOnly: false,
      inGracePeriod: false,
      daysRemaining: 0,
      statusMessage: "Free Starter Plan active.",
      canUpgrade: true,
      canWrite: true,
    };
  }

  // 5. Active Paid Subscription
  if (periodEnd && currentTime >= periodEnd) {
    // Period has expired without renewal -> automatic past_due entry
    return {
      status: "past_due",
      isReadOnly: false,
      inGracePeriod: true,
      daysRemaining: 7,
      statusMessage: "Subscription period has ended. Grace period active.",
      canUpgrade: true,
      canWrite: true,
    };
  }

  const daysLeft = periodEnd ? Math.ceil((periodEnd - currentTime) / (1000 * 60 * 60 * 24)) : 30;

  return {
    status: "active",
    isReadOnly: false,
    inGracePeriod: false,
    daysRemaining: Math.max(0, daysLeft),
    statusMessage: "Subscription active and in good standing.",
    canUpgrade: sub.planTier !== "business",
    canWrite: true,
  };
}
