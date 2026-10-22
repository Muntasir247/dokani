import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { ApiKeyService } from "@/lib/api-keys/index";
import * as adminModule from "@/lib/supabase/admin";
import * as billingGuardModule from "@/lib/billing/guard";

describe("Public REST API Key Authentication & Lifecycle", () => {
  const dummyPlaintextKey = "dk_live_1a2b3c4d5e6f_0123456789abcdef0123456789abcdef";
  const dummyHash = crypto.createHash("sha256").update(dummyPlaintextKey).digest("hex");

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies a valid API key with scoped permissions on Business plan", async () => {
    const mockRecord = {
      id: "key_01",
      tenant_id: "tenant_business_01",
      name: "Shopify Integration Key",
      scopes: ["read:products", "write:sales", "read:inventory"],
      rate_limit_per_minute: 120,
      expires_at: null,
      revoked_at: null,
    };

    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockRecord }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({}),
        })),
      })),
    };

    vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockAdmin as any);
    vi.spyOn(billingGuardModule, "assertFeatureEnabled").mockResolvedValue(undefined as any);

    const result = await ApiKeyService.verifyApiKey(dummyPlaintextKey);

    expect(result.valid).toBe(true);
    expect(result.tenantId).toBe("tenant_business_01");
    expect(result.scopes).toContain("read:products");
    expect(result.scopes).toContain("write:sales");
  });

  describe("Acceptance Criterion: A revoked API key stops working immediately", () => {
    it("immediately rejects an API key if revoked_at is set", async () => {
      const revokedRecord = {
        id: "key_revoked",
        tenant_id: "tenant_01",
        name: "Compromised Key",
        scopes: ["read:products"],
        rate_limit_per_minute: 60,
        expires_at: null,
        revoked_at: new Date().toISOString(), // Key is revoked!
      };

      const mockAdmin = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: revokedRecord }),
            })),
          })),
        })),
      };

      vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockAdmin as any);

      const result = await ApiKeyService.verifyApiKey(dummyPlaintextKey);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("revoked");
      expect(result.error).toMatch(/revoked and is immediately inactive/i);
    });
  });

  it("rejects unknown or invalid formatted API keys", async () => {
    const invalidFormat = await ApiKeyService.verifyApiKey("invalid_prefix_token");
    expect(invalidFormat.valid).toBe(false);
    expect(invalidFormat.reason).toBe("invalid_format");

    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          })),
        })),
      })),
    };
    vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockAdmin as any);

    const unknown = await ApiKeyService.verifyApiKey("dk_live_unknown_secret_key");
    expect(unknown.valid).toBe(false);
    expect(unknown.reason).toBe("not_found");
  });

  it("enforces Business plan restriction on API access", async () => {
    const mockRecord = {
      id: "key_free_tier",
      tenant_id: "tenant_free_01",
      name: "Key on Free Plan",
      scopes: ["read:products"],
      expires_at: null,
      revoked_at: null,
    };

    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockRecord }),
          })),
        })),
      })),
    };

    vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockAdmin as any);
    vi.spyOn(billingGuardModule, "assertFeatureEnabled").mockRejectedValue(
      new Error("Feature 'apiAccess' is not enabled on the free plan.")
    );

    const result = await ApiKeyService.verifyApiKey(dummyPlaintextKey);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("plan_restricted");
    expect(result.error).toMatch(/Dokani Business subscription/i);
  });
});
