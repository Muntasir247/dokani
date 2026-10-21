import { createAdminClient } from "@/lib/supabase/admin";
import { Json } from "@/types/database.types";

export interface AuditLogParams {
  tenantId: string;
  actorId: string | null;
  action:
    | "auth.login"
    | "member.role_changed"
    | "member.invitation_created"
    | "member.invitation_accepted"
    | "member.invitation_revoked"
    | "variant.price_updated"
    | "stock.adjusted"
    | "sale.created"
    | "sale.voided"
    | "entity.deleted"
    | (string & {});
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Inserts an immutable audit log entry into `audit_logs`.
 * Uses the admin client to guarantee delivery regardless of caller's active RLS level.
 */
export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  try {
    const supabase = createAdminClient();

    await supabase.from("audit_logs").insert({
      tenant_id: params.tenantId,
      actor_id: params.actorId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      old_values: (params.oldValues as Json) ?? null,
      new_values: (params.newValues as Json) ?? null,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
    });
  } catch (err) {
    // Audit logging failure should not crash the request, but must be reported
    console.error("[AuditLog Error]: Failed to write audit event", err, params);
  }
}
