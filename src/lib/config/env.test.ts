import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { clientEnvSchema, serverEnvSchema } from "./env";

describe("Environment Validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("validates valid client environment variables", () => {
    const validData = {
      NEXT_PUBLIC_SUPABASE_URL: "https://xyz.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "valid-anon-key",
      NEXT_PUBLIC_APP_URL: "https://dokani.app",
      NEXT_PUBLIC_DEFAULT_CURRENCY: "BDT",
      NEXT_PUBLIC_DEFAULT_TIMEZONE: "Asia/Dhaka",
    };

    const parsed = clientEnvSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.NEXT_PUBLIC_DEFAULT_CURRENCY).toBe("BDT");
      expect(parsed.data.NEXT_PUBLIC_DEFAULT_TIMEZONE).toBe("Asia/Dhaka");
    }
  });

  it("rejects invalid Supabase URL", () => {
    const invalidData = {
      NEXT_PUBLIC_SUPABASE_URL: "not-a-valid-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "valid-anon-key",
    };

    const parsed = clientEnvSchema.safeParse(invalidData);
    expect(parsed.success).toBe(false);
  });

  it("validates server environment variables including service role key", () => {
    const validServerData = {
      NEXT_PUBLIC_SUPABASE_URL: "https://xyz.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "valid-anon-key",
      NEXT_PUBLIC_APP_URL: "https://dokani.app",
      NEXT_PUBLIC_DEFAULT_CURRENCY: "BDT",
      NEXT_PUBLIC_DEFAULT_TIMEZONE: "Asia/Dhaka",
      SUPABASE_SERVICE_ROLE_KEY: "super-secret-service-role-key",
      NODE_ENV: "development",
    };

    const parsed = serverEnvSchema.safeParse(validServerData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.SUPABASE_SERVICE_ROLE_KEY).toBe("super-secret-service-role-key");
    }
  });

  it("fails server validation when service role key is empty", () => {
    const invalidServerData = {
      NEXT_PUBLIC_SUPABASE_URL: "https://xyz.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "valid-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "",
    };

    const parsed = serverEnvSchema.safeParse(invalidServerData);
    expect(parsed.success).toBe(false);
  });
});
