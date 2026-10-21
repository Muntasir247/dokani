import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/permissions";
import { stockTakeSchema } from "@/lib/validation/inventory";
import { callRpc } from "@/lib/supabase/rpc";
import { UserRole } from "@/types/database.types";

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
    const parseResult = stockTakeSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Verify role
    const { data: memberData } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", data.tenant_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!memberData) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
      assertPermission(memberData.role, "manage:inventory");
    } catch {
      return NextResponse.json(
        { error: "Forbidden: Cashiers cannot reconcile stock takes" },
        { status: 403 }
      );
    }

    // Call atomic Postgres RPC fn_stock_take
    const { data: result, error: rpcError } = await callRpc<Record<string, unknown>>(
      supabase,
      "fn_stock_take",
      {
        p_tenant_id: data.tenant_id,
        p_location_id: data.location_id,
        p_variant_id: data.variant_id,
        p_counted_quantity: data.counted_quantity,
        p_notes: data.notes || undefined,
      }
    );

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    return NextResponse.json({ result, message: "Cycle count reconciled successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
