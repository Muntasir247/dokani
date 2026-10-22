import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  let dbStatus: "connected" | "disconnected" = "disconnected";
  let dbLatencyMs = 0;
  let dbError: string | null = null;

  let supabaseHost = "unknown";
  let hasServiceKey = false;

  try {
    const env = getServerEnv();
    try {
      supabaseHost = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host;
    } catch {
      supabaseHost = "invalid-url";
    }
    hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes("mock");

    const supabase = getServiceSupabase();
    const dbStart = Date.now();
    // Simple fast ping
    const { error } = await supabase.from("tenants").select("id").limit(1);
    dbLatencyMs = Date.now() - dbStart;
    if (!error) {
      dbStatus = "connected";
    } else {
      dbError = error.message;
    }
  } catch (err: unknown) {
    dbStatus = "disconnected";
    dbError = err instanceof Error ? err.message : "Unknown error connecting to database";
  }

  const memory = process.memoryUsage();
  const uptimeSeconds = Math.floor(process.uptime());

  const isHealthy = dbStatus === "connected";

  const payload = {
    status: isHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    version: process.env.npm_package_version || "0.1.0",
    checks: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        host: supabaseHost,
        hasServiceKey,
        ...(dbError ? { error: dbError } : {}),
      },
      memory: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
      },
    },
    responseTimeMs: Date.now() - startTime,
  };

  return NextResponse.json(payload, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
