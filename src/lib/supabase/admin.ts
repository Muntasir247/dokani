import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database.types";
import { getServerEnv } from "@/lib/config/env";

/**
 * Service role Supabase client.
 * WARNING: This client bypasses Row Level Security (RLS).
 * It must ONLY be used in secure server environments (e.g. background tasks,
 * tenant onboarding, webhook handlers, offline sync reconciliation).
 */
export function createAdminClient() {
  const env = getServerEnv();

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
