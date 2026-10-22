import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NotificationService } from "@/lib/notifications/notifier";
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
    const { tenantId, sessionId, countedCashPoisha, notes } = body;

    if (!tenantId || !sessionId) {
      return NextResponse.json(
        { error: "tenantId and sessionId are required" },
        { status: 400 }
      );
    }

    const countedPoisha = Math.max(0, parseInt(countedCashPoisha || "0", 10));

    // Call close shift RPC
    const { data: result, error: rpcError } = await callRpc<{
      success: boolean;
      sessionId: string;
      openedAt: string;
      closedAt: string;
      openingFloatPoisha: number;
      cashSalesPoisha: number;
      cashDuesCollectedPoisha: number;
      cashInsPoisha: number;
      cashOutsPoisha: number;
      cashRefundsPoisha: number;
      expectedCashPoisha: number;
      countedCashPoisha: number;
      variancePoisha: number;
    }>(supabase, "fn_close_cash_drawer", {
      p_tenant_id: tenantId,
      p_session_id: sessionId,
      p_counted_cash_poisha: countedPoisha,
      p_notes: notes || null,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    // If variance is over threshold (৳100 / 10,000 poisha), send notification
    if (result && Math.abs(result.variancePoisha) >= 10000) {
      // Fetch owner email
      const { data: ownerMember } = (await supabase
        .from("tenant_members")
        .select("profiles(email, full_name)")
        .eq("tenant_id", tenantId)
        .eq("role", "owner")
        .maybeSingle()) as { data: { profiles: { email?: string; full_name?: string } } | null };

      const ownerEmail = ownerMember?.profiles?.email;
      const cashierName = user.user_metadata?.full_name || user.email || "Cashier";

      await NotificationService.notifyShiftVariance({
        tenantId,
        sessionId,
        cashierName,
        variancePoisha: result.variancePoisha,
        expectedCashPoisha: result.expectedCashPoisha,
        countedCashPoisha: result.countedCashPoisha,
        ownerEmail,
      });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
