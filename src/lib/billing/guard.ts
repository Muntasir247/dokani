/**
 * Server-Side Plan Limit & Feature Guard
 *
 * Enforces resource caps, feature flags, and read-only subscription restrictions
 * before any write operations can execute.
 */

import { callRpc } from "@/lib/supabase/rpc";
import { isFeatureAllowed, PlanFeatures } from "./plan-config";
import { PlanTier } from "@/types/database.types";

export class PlanLimitExceededError extends Error {
  public readonly code = "PLAN_LIMIT_EXCEEDED";
  public readonly resource: string;
  public readonly current: number;
  public readonly max: number;

  constructor(resource: string, current: number, max: number, message?: string) {
    super(message || `Plan limit reached: ${current} of ${max} ${resource} used. Upgrade plan to create more.`);
    this.name = "PlanLimitExceededError";
    this.resource = resource;
    this.current = current;
    this.max = max;
  }
}

export class SubscriptionReadOnlyError extends Error {
  public readonly code = "SUBSCRIPTION_READ_ONLY";

  constructor(message?: string) {
    super(
      message ||
        "Your subscription is past due and the grace period has expired. Your account is in read-only mode. All data is preserved, but creation and edits are locked."
    );
    this.name = "SubscriptionReadOnlyError";
  }
}

export class FeatureNotAllowedError extends Error {
  public readonly code = "FEATURE_NOT_ALLOWED";
  public readonly feature: string;
  public readonly planTier: string;

  constructor(feature: string, planTier: string, message?: string) {
    super(
      message ||
        `Feature '${feature}' is not included in the ${planTier.toUpperCase()} plan. Please upgrade to access this feature.`
    );
    this.name = "FeatureNotAllowedError";
    this.feature = feature;
    this.planTier = planTier;
  }
}

/**
 * Asserts that creating an additional resource unit does not exceed plan limits.
 * Throws PlanLimitExceededError or SubscriptionReadOnlyError if blocked.
 */
export async function assertCanCreateResource(
  supabase: unknown,
  tenantId: string,
  resource: "stores" | "staff" | "products"
): Promise<void> {
  const { data, error } = await callRpc<{
    allowed: boolean;
    isReadOnly?: boolean;
    reason?: string;
    current?: number;
    max?: number;
  }>(supabase, "fn_check_plan_limits", {
    p_tenant_id: tenantId,
    p_resource: resource,
  });

  if (error) {
    throw new Error(error.message || "Failed to verify plan limit compliance");
  }

  if (!data?.allowed) {
    if (data?.isReadOnly) {
      throw new SubscriptionReadOnlyError(data.reason);
    }
    throw new PlanLimitExceededError(
      resource,
      data?.current ?? 0,
      data?.max ?? 0,
      data?.reason
    );
  }
}

/**
 * Asserts that a feature flag is enabled on the tenant's current plan.
 * Throws FeatureNotAllowedError if disabled.
 */
export async function assertFeatureEnabled(
  supabaseClient: unknown,
  tenantId: string,
  feature: keyof PlanFeatures
): Promise<void> {
  type ClientWithFrom = {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          is: (col: string, val: null) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (num: number) => {
                maybeSingle: () => Promise<{ data: { plan_tier: PlanTier } | null }>;
              };
            };
          };
        };
      };
    };
  };

  const client = supabaseClient as ClientWithFrom;
  const { data: sub } = await client
    .from("subscriptions")
    .select("plan_tier")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planTier: PlanTier = sub?.plan_tier || "free";

  if (!isFeatureAllowed(planTier, feature)) {
    throw new FeatureNotAllowedError(feature, planTier);
  }
}
