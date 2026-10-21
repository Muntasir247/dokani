import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { returnSaleSchema } from "@/lib/validation/pos";
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
    const parseResult = returnSaleSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Verify tenant membership
    const { data: memberData } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", data.tenant_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!memberData) {
      return NextResponse.json({ error: "Forbidden: Not a member of this store" }, { status: 403 });
    }

    // Call atomic Postgres transactional function fn_return_sale
    const { data: returnResult, error: rpcError } = await callRpc(supabase, "fn_return_sale", {
      p_tenant_id: data.tenant_id,
      p_sale_id: data.sale_id,
      p_store_id: data.store_id,
      p_location_id: data.location_id,
      p_items: data.items,
      p_refund_method: data.refund_method,
      p_reason: data.reason,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    return NextResponse.json({ return: returnResult }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
