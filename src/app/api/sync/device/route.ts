import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
    const { tenantId, storeId, deviceCode, deviceName, action } = body;

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    // Role check
    const { data: memberData, error: memberError } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null; error: { message: string } | null };

    if (memberError || !memberData) {
      return NextResponse.json({ error: "Forbidden: Not a tenant member" }, { status: 403 });
    }

    // Action: Revoke device (Manager / Owner only)
    if (action === "revoke") {
      const { deviceId } = body;
      if (!deviceId) {
        return NextResponse.json({ error: "deviceId is required to revoke" }, { status: 400 });
      }

      const { data: rpcData, error: rpcError } = await callRpc(supabase, "fn_revoke_device", {
        p_tenant_id: tenantId,
        p_device_id: deviceId,
      });

      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 400 });
      }
      return NextResponse.json(rpcData);
    }

    // Default Action: Register or heart-beat device
    if (!deviceCode) {
      return NextResponse.json({ error: "deviceCode is required" }, { status: 400 });
    }

    const { data: device, error: devError } = await (supabase
      .from("tenant_devices" as any) as any)
      .upsert(
        {
          tenant_id: tenantId,
          store_id: storeId,
          device_code: deviceCode,
          device_name: deviceName || `Terminal ${deviceCode}`,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id, device_code" }
      )
      .select()
      .single();

    if (devError) {
      return NextResponse.json({ error: devError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      device: {
        id: device.id,
        deviceCode: device.device_code,
        deviceName: device.device_name,
        isRevoked: device.is_revoked,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Device management error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
