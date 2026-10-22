import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/types/database.types";
import { getClientEnv } from "@/lib/config/env";
import { createAdminClient } from "./admin";

/**
 * Creates a singleton browser-side Supabase client for client components.
 */
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const env = getClientEnv();
  browserClient = createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return browserClient;
}

export function getServiceSupabase() {
  return createAdminClient();
}

