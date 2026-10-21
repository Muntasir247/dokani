import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/database.types";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Retrieve active memberships with tenant metadata
    const { data, error } = (await supabase
      .from("tenant_members")
      .select(`
        id,
        role,
        is_active,
        tenant_id,
        tenants (
          id,
          name,
          slug,
          currency,
          timezone
        )
      `)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)) as {
      data: Array<{
        id: string;
        role: UserRole;
        is_active: boolean;
        tenant_id: string;
        tenants: unknown;
      }> | null;
      error: { message: string } | null;
    };

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const formattedTenants = (data || []).map((membership) => ({
      memberId: membership.id,
      role: membership.role,
      tenant: membership.tenants,
    }));

    return NextResponse.json({ tenants: formattedTenants });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
