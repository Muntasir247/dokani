import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";
import { getPlanConfig } from "@/lib/billing/plan-config";
import { PlanTier } from "@/types/database.types";

const setPlanSchema = z.object({
  tenantId: z.string().uuid(),
  planTier: z.enum(["free", "pro", "business"]),
  status: z.enum(["trialing", "active", "past_due", "canceled"]).default("active"),
});

export async function POST(req: NextRequest) {
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
    const parseResult = setPlanSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tenantId, planTier, status } = parseResult.data;
    const planConfig = getPlanConfig(planTier as PlanTier);

    const { data, error } = await callRpc<{ success: boolean; error?: string }>(
      supabase,
      "fn_admin_set_plan",
      {
        p_tenant_id: tenantId,
        p_plan: planTier,
        p_status: status,
        p_max_stores: planConfig.limits.maxStores,
        p_max_products: planConfig.limits.maxProducts,
        p_max_staff: planConfig.limits.maxStaff,
      }
    );

    if (error || !data?.success) {
      return NextResponse.json(
        { error: data?.error || error?.message || "Failed to set plan" },
        { status: 403 }
      );
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
