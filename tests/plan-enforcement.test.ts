import { describe, it, expect, vi } from "vitest";
import {
  assertCanCreateResource,
  assertFeatureEnabled,
  PlanLimitExceededError,
  SubscriptionReadOnlyError,
  FeatureNotAllowedError,
} from "@/lib/billing/guard";

describe("Server-Side Plan Limit & Feature Guards", () => {
  describe("assertCanCreateResource()", () => {
    it("resolves cleanly when resource is within plan limits", async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { allowed: true, current: 5, max: 200 },
          error: null,
        }),
      };

      await expect(
        assertCanCreateResource(mockSupabase, "tenant-1", "products")
      ).resolves.toBeUndefined();

      expect(mockSupabase.rpc).toHaveBeenCalledWith("fn_check_plan_limits", {
        p_tenant_id: "tenant-1",
        p_resource: "products",
      });
    });

    it("throws PlanLimitExceededError when resource cap has been reached", async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: {
            allowed: false,
            isReadOnly: false,
            current: 200,
            max: 200,
            reason: "Free tier limit reached: 200 of 200 products created. Upgrade to Pro for 5,000 products.",
          },
          error: null,
        }),
      };

      await expect(
        assertCanCreateResource(mockSupabase, "tenant-1", "products")
      ).rejects.toThrow(PlanLimitExceededError);

      try {
        await assertCanCreateResource(mockSupabase, "tenant-1", "products");
      } catch (err: unknown) {
        const error = err as PlanLimitExceededError;
        expect(error.code).toBe("PLAN_LIMIT_EXCEEDED");
        expect(error.resource).toBe("products");
        expect(error.current).toBe(200);
        expect(error.max).toBe(200);
        expect(error.message).toContain("Upgrade to Pro");
      }
    });

    it("throws SubscriptionReadOnlyError when store is locked in read-only mode after grace period", async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: {
            allowed: false,
            isReadOnly: true,
            reason: "Account is in read-only mode due to expired subscription grace period. All store data is preserved.",
          },
          error: null,
        }),
      };

      await expect(
        assertCanCreateResource(mockSupabase, "tenant-past-due", "products")
      ).rejects.toThrow(SubscriptionReadOnlyError);

      try {
        await assertCanCreateResource(mockSupabase, "tenant-past-due", "products");
      } catch (err: unknown) {
        const error = err as SubscriptionReadOnlyError;
        expect(error.code).toBe("SUBSCRIPTION_READ_ONLY");
        expect(error.message).toContain("read-only mode");
      }
    });

    it("handles RPC error by throwing a descriptive error", async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database connection failed" },
        }),
      };

      await expect(
        assertCanCreateResource(mockSupabase, "tenant-1", "staff")
      ).rejects.toThrow("Database connection failed");
    });
  });

  describe("assertFeatureEnabled()", () => {
    function createMockSupabaseWithPlan(planTier: "free" | "pro" | "business") {
      return {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { plan_tier: planTier },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      };
    }

    it("allows report export when tenant is on Pro plan", async () => {
      const mockSupabase = createMockSupabaseWithPlan("pro");

      await expect(
        assertFeatureEnabled(mockSupabase, "tenant-pro", "exportReports")
      ).resolves.toBeUndefined();
    });

    it("blocks report export and throws FeatureNotAllowedError when tenant is on Free plan", async () => {
      const mockSupabase = createMockSupabaseWithPlan("free");

      await expect(
        assertFeatureEnabled(mockSupabase, "tenant-free", "exportReports")
      ).rejects.toThrow(FeatureNotAllowedError);

      try {
        await assertFeatureEnabled(mockSupabase, "tenant-free", "exportReports");
      } catch (err: unknown) {
        const error = err as FeatureNotAllowedError;
        expect(error.code).toBe("FEATURE_NOT_ALLOWED");
        expect(error.feature).toBe("exportReports");
        expect(error.planTier).toBe("free");
        expect(error.message).toContain("not included in the FREE plan");
      }
    });

    it("blocks serial tracking on Free plan", async () => {
      const mockSupabase = createMockSupabaseWithPlan("free");

      await expect(
        assertFeatureEnabled(mockSupabase, "tenant-free", "serialTracking")
      ).rejects.toThrow(FeatureNotAllowedError);
    });

    it("allows serial tracking and multi-branch on Pro and Business plans", async () => {
      const proClient = createMockSupabaseWithPlan("pro");
      const bizClient = createMockSupabaseWithPlan("business");

      await expect(assertFeatureEnabled(proClient, "t-pro", "serialTracking")).resolves.toBeUndefined();
      await expect(assertFeatureEnabled(bizClient, "t-biz", "serialTracking")).resolves.toBeUndefined();
      await expect(assertFeatureEnabled(bizClient, "t-biz", "apiAccess")).resolves.toBeUndefined();
    });
  });
});
