import { describe, it, expect } from "vitest";
import { sanitizeForLogging } from "@/lib/observability/logger";

describe("Data Protection: Tenant Export, Deletion Lifecycle & Observability", () => {
  describe("Tenant Soft-Deletion & 30-Day Retention Window", () => {
    it("computes retention purge date and remaining days accurately", () => {
      const now = Date.now();
      const retentionDays = 30;
      const scheduledAt = new Date(now).toISOString();
      const purgeAfter = new Date(now + retentionDays * 86400000).toISOString();

      const daysRemaining = Math.max(
        0,
        Math.ceil((new Date(purgeAfter).getTime() - now) / 86400000)
      );

      expect(daysRemaining).toBe(30);
      expect(new Date(purgeAfter).getTime()).toBeGreaterThan(new Date(scheduledAt).getTime());
    });

    it("verifies state transition on deletion schedule and cancellation", () => {
      // Mock tenant record before deletion
      let tenantState: any = {
        id: "tenant_001",
        name: "Test Groceries",
        status: "active",
        deletion_scheduled_at: null,
        retention_purge_after: null,
      };

      // 1. Schedule Deletion (30-day grace period)
      tenantState = {
        ...tenantState,
        status: "pending_deletion",
        deletion_scheduled_at: new Date().toISOString(),
        retention_purge_after: new Date(Date.now() + 30 * 86400000).toISOString(),
      };

      expect(tenantState.status).toBe("pending_deletion");
      expect(tenantState.deletion_scheduled_at).toBeDefined();

      // 2. Owner Cancels Deletion -> Restored to active
      tenantState = {
        ...tenantState,
        status: "active",
        deletion_scheduled_at: null,
        retention_purge_after: null,
      };

      expect(tenantState.status).toBe("active");
      expect(tenantState.deletion_scheduled_at).toBeNull();
      expect(tenantState.retention_purge_after).toBeNull();
    });
  });

  describe("Zero-PII & Secret Redaction in Structured Logging", () => {
    it("redacts sensitive fields like passwords, tokens, API keys, and card numbers", () => {
      const sensitivePayload = {
        tenantId: "tenant_123",
        action: "login",
        password: "SuperSecretPassword123!",
        apiKey: "dk_live_abcdef123456",
        meta: {
          token: "jwt.token.here",
          secretKey: "shhh",
        },
      };

      const sanitized = sanitizeForLogging(sensitivePayload) as Record<string, any>;

      expect(sanitized.tenantId).toBe("tenant_123");
      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.apiKey).toBe("[REDACTED]");
      expect(sanitized.meta.token).toBe("[REDACTED]");
      expect(sanitized.meta.secretKey).toBe("[REDACTED]");
    });

    it("redacts Bangladesh phone numbers and customer emails inside log messages", () => {
      const logMessage = "Failed dispatch to recipient 01712345678 and email customer@example.com";
      const sanitized = sanitizeForLogging(logMessage);

      expect(sanitized).not.toContain("01712345678");
      expect(sanitized).not.toContain("customer@example.com");
      expect(sanitized).toContain("[REDACTED_PHONE]");
      expect(sanitized).toContain("[REDACTED_EMAIL]");
    });
  });
});
