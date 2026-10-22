import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";

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
    const { tenantId, sessionId, type, amountPoisha, reason } = body;

    if (!tenantId || !sessionId || !type || !amountPoisha || !reason) {
      return NextResponse.json(
        { error: "Missing required fields: tenantId, sessionId, type, amountPoisha, reason" },
        { status: 400 }
      );
    }

    if (type !== "cash_in" && type !== "cash_out") {
      return NextResponse.json(
        { error: "type must be 'cash_in' or 'cash_out'" },
        { status: 400 }
      );
    }

    const amount = Math.max(1, parseInt(amountPoisha, 10));

    const { data: result, error: rpcError } = await callRpc<{
      success: boolean;
      txId: string;
      type: string;
      amountPoisha: number;
    }>(supabase, "fn_add_cash_drawer_tx", {
      p_tenant_id: tenantId,
      p_session_id: sessionId,
      p_type: type,
      p_amount_poisha: amount,
      p_reason: reason,
      p_performed_by: user.id,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
