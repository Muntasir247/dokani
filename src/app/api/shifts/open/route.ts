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
    const { tenantId, storeId, openingFloatPoisha, notes } = body;

    if (!tenantId || !storeId) {
      return NextResponse.json(
        { error: "tenantId and storeId are required" },
        { status: 400 }
      );
    }

    const floatPoisha = Math.max(0, parseInt(openingFloatPoisha || "0", 10));

    const { data: result, error: rpcError } = await callRpc<{
      success: boolean;
      isExisting: boolean;
      sessionId: string;
      message: string;
    }>(supabase, "fn_open_cash_drawer", {
      p_tenant_id: tenantId,
      p_store_id: storeId,
      p_cashier_id: user.id,
      p_opening_float_poisha: floatPoisha,
      p_notes: notes || null,
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
