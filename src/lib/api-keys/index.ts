import crypto from "crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertFeatureEnabled } from "@/lib/billing/guard";

export interface ApiKeyVerificationResult {
  valid: boolean;
  tenantId?: string;
  keyId?: string;
  name?: string;
  scopes?: string[];
  rateLimitPerMinute?: number;
  reason?: "invalid_format" | "not_found" | "revoked" | "expired" | "plan_restricted";
  error?: string;
}

export class ApiKeyService {
  /**
   * Generates a new cryptographically secure API key for a tenant.
   * Format: dk_live_<12-hex-prefix>_<32-hex-secret>
   * Only the SHA-256 hash is stored in the database.
   */
  static async createApiKey(params: {
    tenantId: string;
    name: string;
    scopes?: string[];
    rateLimitPerMinute?: number;
    expiresInDays?: number;
    userId?: string;
  }): Promise<{ id: string; name: string; keyPrefix: string; secretKey: string }> {
    const supabase = await createServerSupabaseClient();

    // Verify Business plan has API access enabled
    await assertFeatureEnabled(supabase, params.tenantId, "apiAccess");

    const prefix = crypto.randomBytes(6).toString("hex"); // 12 chars
    const secret = crypto.randomBytes(16).toString("hex"); // 32 chars
    const plaintextKey = `dk_live_${prefix}_${secret}`;
    const keyHash = crypto.createHash("sha256").update(plaintextKey).digest("hex");

    const expiresAt = params.expiresInDays
      ? new Date(Date.now() + params.expiresInDays * 86400000).toISOString()
      : null;

    const { data, error } = await (supabase.from("tenant_api_keys") as any)
      .insert({
        tenant_id: params.tenantId,
        name: params.name,
        key_prefix: `dk_live_${prefix}`,
        key_hash: keyHash,
        scopes: params.scopes || ["read:products", "write:sales", "read:customers"],
        rate_limit_per_minute: params.rateLimitPerMinute || 60,
        expires_at: expiresAt,
        created_by: params.userId || null,
      })
      .select("id, name, key_prefix")
      .single();

    if (error) {
      throw new Error(`Failed to generate API key: ${error.message}`);
    }

    return {
      id: data.id,
      name: data.name,
      keyPrefix: data.key_prefix,
      secretKey: plaintextKey, // Return plaintext once to user
    };
  }

  /**
   * Verifies an incoming bearer / header API key.
   * Acceptance Criterion: A revoked API key stops working immediately.
   */
  static async verifyApiKey(plaintextToken: string): Promise<ApiKeyVerificationResult> {
    if (!plaintextToken || !plaintextToken.startsWith("dk_live_")) {
      return { valid: false, reason: "invalid_format", error: "Invalid API key format" };
    }

    const keyHash = crypto.createHash("sha256").update(plaintextToken).digest("hex");
    const admin = createAdminClient();

    const { data: keyRecord } = (await admin
      .from("tenant_api_keys")
      .select("id, tenant_id, name, scopes, rate_limit_per_minute, expires_at, revoked_at")
      .eq("key_hash", keyHash)
      .maybeSingle()) as {
      data: {
        id: string;
        tenant_id: string;
        name: string;
        scopes: string[];
        rate_limit_per_minute: number;
        expires_at: string | null;
        revoked_at: string | null;
      } | null;
    };

    if (!keyRecord) {
      return { valid: false, reason: "not_found", error: "API key not recognized" };
    }

    // Acceptance Criterion: Revoked key stops working immediately
    if (keyRecord.revoked_at !== null) {
      return {
        valid: false,
        reason: "revoked",
        error: "API key has been revoked and is immediately inactive",
      };
    }

    // Expiry check
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
      return { valid: false, reason: "expired", error: "API key has expired" };
    }

    // Plan check (API is Business tier only)
    try {
      await assertFeatureEnabled(admin, keyRecord.tenant_id, "apiAccess");
    } catch {
      return {
        valid: false,
        reason: "plan_restricted",
        error: "Public REST API requires an active Dokani Business subscription",
      };
    }

    // Update last_used_at asynchronously
    admin
      .from("tenant_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRecord.id)
      .then(() => {});

    return {
      valid: true,
      tenantId: keyRecord.tenant_id,
      keyId: keyRecord.id,
      name: keyRecord.name,
      scopes: keyRecord.scopes || [],
      rateLimitPerMinute: keyRecord.rate_limit_per_minute || 60,
    };
  }

  /**
   * Immediately revokes an API key
   */
  static async revokeApiKey(tenantId: string, keyId: string): Promise<boolean> {
    const supabase = await createServerSupabaseClient();
    const { error } = await (supabase.from("tenant_api_keys") as any)
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("tenant_id", tenantId);

    return !error;
  }
}
