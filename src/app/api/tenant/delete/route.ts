import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET: Query tenant deletion status and retention window details.
 */
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
    const tenantId = searchParams.get("tenant_id") || user.user_metadata?.tenant_id;

    if (!tenantId) {
      return NextResponse.json({ error: "Tenant ID required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: tenant, error } = await admin
      .from("tenants")
      .select("id, name, deleted_at, deletion_scheduled_at, retention_purge_after")
      .eq("id", tenantId)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const isPendingDeletion = Boolean(tenant.deletion_scheduled_at);
    let daysRemaining = 0;
    if (tenant.retention_purge_after) {
      const purgeDate = new Date(tenant.retention_purge_after).getTime();
      const now = Date.now();
      daysRemaining = Math.max(0, Math.ceil((purgeDate - now) / 86400000));
    }

    return NextResponse.json({
      tenantId: tenant.id,
      name: tenant.name,
      isPendingDeletion,
      deletionScheduledAt: tenant.deletion_scheduled_at,
      retentionPurgeAfter: tenant.retention_purge_after,
      daysRemaining,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST: Schedule tenant deletion with a retention window (default 30 days).
 * Only the tenant owner can initiate this.
 */
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

    let body: { tenantId?: string; retentionDays?: number } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is acceptable
    }

    const tenantId = body.tenantId || user.user_metadata?.tenant_id;
    const retentionDays = Math.max(1, body.retentionDays || 30);

    if (!tenantId) {
      return NextResponse.json({ error: "Tenant ID required" }, { status: 400 });
    }

    // Must be tenant owner
    const { data: membership } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .maybeSingle()) as { data: { role: string } | null };

    if (!membership || membership.role !== "owner") {
      return NextResponse.json(
        { error: "Forbidden: Only the workspace owner can schedule account deletion" },
        { status: 403 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await (admin.rpc as any)("fn_schedule_tenant_deletion", {
      p_tenant_id: tenantId,
      p_retention_days: retentionDays,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: `Tenant deletion scheduled successfully with a ${retentionDays}-day retention period`,
      tenant: data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Schedule deletion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE: Cancel a pending tenant deletion schedule and restore full access.
 */
export async function DELETE(req: NextRequest) {
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
    const tenantId = searchParams.get("tenant_id") || user.user_metadata?.tenant_id;

    if (!tenantId) {
      return NextResponse.json({ error: "Tenant ID required" }, { status: 400 });
    }

    // Must be tenant owner
    const { data: membership } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .maybeSingle()) as { data: { role: string } | null };

    if (!membership || membership.role !== "owner") {
      return NextResponse.json(
        { error: "Forbidden: Only the workspace owner can cancel account deletion" },
        { status: 403 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await (admin.rpc as any)("fn_cancel_tenant_deletion", {
      p_tenant_id: tenantId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: "Tenant deletion has been canceled and the account is fully restored",
      tenant: data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Cancel deletion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
