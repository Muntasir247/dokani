import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || req.headers.get("x-tenant-id");
    const storeId = searchParams.get("storeId");

    if (!tenantId || !storeId) {
      return NextResponse.json(
        { error: "tenantId and storeId are required parameters" },
        { status: 400 }
      );
    }

    const { data: session, error } = (await supabase
      .from("cash_drawer_sessions")
      .select(`
        id,
        tenant_id,
        store_id,
        cashier_id,
        opened_at,
        opening_float_poisha,
        status,
        notes
      `)
      .eq("tenant_id", tenantId)
      .eq("store_id", storeId)
      .eq("cashier_id", user.id)
      .eq("status", "open")
      .maybeSingle()) as {
      data: {
        id: string;
        tenant_id: string;
        store_id: string;
        cashier_id: string;
        opened_at: string;
        opening_float_poisha: number;
        status: "open" | "closed";
        notes: string | null;
      } | null;
      error: { message: string } | null;
    };

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!session) {
      return NextResponse.json({ activeSession: null });
    }

    // Fetch manual cash in / out transactions for this active session
    const { data: txs } = (await supabase
      .from("cash_drawer_transactions")
      .select("id, type, amount_poisha, reason, created_at")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true })) as {
      data: Array<{
        id: string;
        type: "cash_in" | "cash_out";
        amount_poisha: number;
        reason: string;
        created_at: string;
      }> | null;
    };

    return NextResponse.json({
      activeSession: {
        ...session,
        transactions: txs || [],
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
