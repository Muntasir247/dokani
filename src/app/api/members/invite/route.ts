import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";

const inviteSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["manager", "cashier"]),
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
    const parseResult = inviteSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tenantId, email, role } = parseResult.data;

    // Call invite RPC function
    const { data, error } = await callRpc(supabase, "fn_invite_staff", {
      p_tenant_id: tenantId,
      p_email: email,
      p_role: role,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ success: true, invitation: data }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
