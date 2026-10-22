import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";

const extendTrialSchema = z.object({
  tenantId: z.string().uuid(),
  days: z.number().int().min(1).max(365),
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
    const parseResult = extendTrialSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tenantId, days } = parseResult.data;

    const { data, error } = await callRpc<{ success: boolean; error?: string; new_trial_ends_at?: string }>(
      supabase,
      "fn_admin_extend_trial",
      {
        p_tenant_id: tenantId,
        p_days: days,
      }
    );

    if (error || !data?.success) {
      return NextResponse.json(
        { error: data?.error || error?.message || "Failed to extend trial" },
        { status: 403 }
      );
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
