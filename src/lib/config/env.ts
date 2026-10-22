import { z } from "zod";

/**
 * Client-accessible environment variables (must start with NEXT_PUBLIC_)
 */
export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL")
    .transform((val) => val.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, ""))
    .default("http://127.0.0.1:54321"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required")
    .default("mock-anon-key"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a valid URL")
    .transform((val) => val.replace(/\/+$/, ""))
    .default("http://localhost:3000"),
  NEXT_PUBLIC_DEFAULT_CURRENCY: z.string().default("BDT"),
  NEXT_PUBLIC_DEFAULT_TIMEZONE: z.string().default("Asia/Dhaka"),
});

/**
 * Server-only environment variables (NEVER expose to client bundle)
 */
export const serverEnvSchema = clientEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required for server admin operations")
    .default("mock-service-role-key"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

let validatedServerEnv: ServerEnv | null = null;
let validatedClientEnv: ClientEnv | null = null;

/**
 * Retrieves and validates server environment variables.
 * Throws a formatted error if required server variables are missing.
 */
export function getServerEnv(): ServerEnv {
  if (validatedServerEnv) {
    return validatedServerEnv;
  }

  const result = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_DEFAULT_CURRENCY: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY,
    NEXT_PUBLIC_DEFAULT_TIMEZONE: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
      .join("\n");
    throw new Error(`[Env Validation Failed - Server]:\n${errorDetails}`);
  }

  validatedServerEnv = result.data;
  return validatedServerEnv;
}

/**
 * Retrieves and validates client environment variables.
 */
export function getClientEnv(): ClientEnv {
  if (validatedClientEnv) {
    return validatedClientEnv;
  }

  const result = clientEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_DEFAULT_CURRENCY: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY,
    NEXT_PUBLIC_DEFAULT_TIMEZONE: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE,
  });

  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
      .join("\n");
    throw new Error(`[Env Validation Failed - Client]:\n${errorDetails}`);
  }

  validatedClientEnv = result.data;
  return validatedClientEnv;
}
