import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check super admin privileges
    const { data: profile } = (await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .single()) as { data: { is_super_admin: boolean } | null };

    if (!profile?.is_super_admin) {
      return NextResponse.json(
        { error: "Forbidden: Super admin privileges required" },
        { status: 403 }
      );
    }

    // Fetch all tenants with subscriptions
    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select(`
        id,
        name,
        slug,
        currency,
        created_at,
        subscriptions (
          id,
          plan_tier,
          status,
          trial_ends_at,
          current_period_end,
          max_stores,
          max_products,
          max_staff
        )
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (tenantsError) {
      return NextResponse.json({ error: tenantsError.message }, { status: 500 });
    }

    return NextResponse.json({ tenants: tenants || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
