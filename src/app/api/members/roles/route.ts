import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";

const updateRoleSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID"),
  memberId: z.string().uuid("Invalid member ID"),
  newRole: z.enum(["owner", "manager", "cashier"]),
});

export async function PATCH(req: Request) {
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
    const parseResult = updateRoleSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tenantId, memberId, newRole } = parseResult.data;

    const { error } = await callRpc(supabase, "fn_update_member_role", {
      p_tenant_id: tenantId,
      p_member_id: memberId,
      p_new_role: newRole,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ success: true, newRole });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
