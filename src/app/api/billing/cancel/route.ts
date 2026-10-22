import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/database.types";
import { logAuditEvent } from "@/lib/audit";

const cancelSchema = z.object({
  tenantId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

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
    const parseResult = cancelSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tenantId, reason } = parseResult.data;

    // Verify owner role
    const { data: memberData } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!memberData || memberData.role !== "owner") {
      return NextResponse.json(
        { error: "Forbidden: Only store owners can cancel subscriptions" },
        { status: 403 }
      );
    }

    // Set cancel_at_period_end
    const { data: updatedSub, error: updateError } = await supabase
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // Audit log
    await logAuditEvent({
      tenantId,
      actorId: user.id,
      action: "subscription:canceled",
      entityType: "subscriptions",
      entityId: tenantId,
      newValues: { cancel_at_period_end: true, reason: reason || null },
    });

    return NextResponse.json({
      success: true,
      message: "Subscription scheduled for cancellation at end of billing period. Data will be preserved.",
      subscription: updatedSub,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
