import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";

const onboardingSchema = z.object({
  tenantName: z.string().min(2, "Store name must be at least 2 characters"),
  slug: z.string().min(3, "Slug must be at least 3 characters").regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase alphanumeric characters and hyphens"),
  storeName: z.string().min(2, "Branch name must be at least 2 characters"),
  storeCode: z.string().min(2, "Branch code must be at least 2 characters").max(20),
  currency: z.string().default("BDT"),
  timezone: z.string().default("Asia/Dhaka"),
});

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = onboardingSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tenantName, slug, storeName, storeCode, currency, timezone } = parseResult.data;

    // Call atomic Postgres onboarding function
    const { data, error } = await callRpc(supabase, "fn_create_tenant_onboarding", {
      p_tenant_name: tenantName,
      p_slug: slug,
      p_store_name: storeName,
      p_store_code: storeCode,
      p_currency: currency,
      p_timezone: timezone,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
