import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";

const revokeSchema = z.object({
  invitationId: z.string().uuid("Invalid invitation ID"),
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
    const parseResult = revokeSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { invitationId } = parseResult.data;

    const { data: success, error } = await callRpc<boolean>(supabase, "fn_revoke_invitation", {
      p_invitation_id: invitationId,
    });

    if (error || !success) {
      return NextResponse.json(
        { error: error?.message || "Failed to revoke invitation" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
