import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { voidSaleSchema } from "@/lib/validation/pos";
import { callRpc } from "@/lib/supabase/rpc";
import { assertPermission } from "@/lib/auth/permissions";
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
    const parseResult = voidSaleSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Verify tenant membership & role
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

    // Role guard: Only Manager or Owner can void sales!
    try {
      assertPermission(memberData.role, "void:sale");
    } catch {
      return NextResponse.json(
        { error: "Forbidden: Only managers and owners can void sales" },
        { status: 403 }
      );
    }

    // Call atomic Postgres transactional function fn_void_sale
    const { data: voidResult, error: rpcError } = await callRpc(supabase, "fn_void_sale", {
      p_tenant_id: data.tenant_id,
      p_sale_id: data.sale_id,
      p_reason: data.reason,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    return NextResponse.json({ void: voidResult });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
