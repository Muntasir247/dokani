import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPlanConfig } from "@/lib/billing/plan-config";
import { evaluateSubscriptionLifecycle, SubscriptionSnapshot } from "@/lib/billing/lifecycle";
import { Database, PlanTier, UserRole } from "@/types/database.types";

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

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId parameter is required" }, { status: 400 });
    }

    // Verify membership
    const { data: memberData } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!memberData) {
      return NextResponse.json({ error: "Forbidden: Not a tenant member" }, { status: 403 });
    }

    // 1. Fetch Subscription Record
    const { data: subData, error: subError } = (await supabase
      .from("subscriptions")
      .select("*")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()) as {
      data: Database["public"]["Tables"]["subscriptions"]["Row"] | null;
      error: unknown;
    };

    if (subError || !subData) {
      return NextResponse.json({ error: "No subscription record found" }, { status: 404 });
    }

    const snapshot: SubscriptionSnapshot = {
      id: subData.id,
      tenantId: subData.tenant_id,
      planTier: subData.plan_tier as PlanTier,
      status: subData.status,
      currentPeriodStart: subData.current_period_start,
      currentPeriodEnd: subData.current_period_end,
      trialEndsAt: subData.trial_ends_at,
      gracePeriodEndsAt: subData.grace_period_ends_at,
      cancelAtPeriodEnd: subData.cancel_at_period_end,
    };

    const lifecycle = evaluateSubscriptionLifecycle(snapshot);
    const planConfig = getPlanConfig(snapshot.planTier);

    // 2. Fetch Active Usage Counts
    const { count: storeCount } = await supabase
      .from("stores")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    const { count: staffCount } = await supabase
      .from("tenant_members")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .is("deleted_at", null);

    const { count: productCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    // 3. Fetch Invoices History
    const { data: invoices } = await supabase
      .from("subscription_invoices")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      subscription: {
        ...subData,
        lifecycle,
      },
      plan: planConfig,
      usage: {
        stores: {
          current: storeCount || 0,
          max: subData.max_stores,
          percentage: Math.min(100, Math.round(((storeCount || 0) / subData.max_stores) * 100)),
        },
        staff: {
          current: staffCount || 0,
          max: subData.max_staff,
          percentage: Math.min(100, Math.round(((staffCount || 0) / subData.max_staff) * 100)),
        },
        products: {
          current: productCount || 0,
          max: subData.max_products,
          percentage: Math.min(100, Math.round(((productCount || 0) / subData.max_products) * 100)),
        },
      },
      invoices: invoices || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
