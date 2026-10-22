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
    const {
      outboxId,
      tenantId,
      storeId,
      mutationType,
      idempotencyKey,
      payload,
    } = body;

    if (!outboxId || !tenantId || !mutationType || !idempotencyKey || !payload) {
      return NextResponse.json(
        { error: "Missing required fields: outboxId, tenantId, mutationType, idempotencyKey, payload" },
        { status: 400 }
      );
    }

    // 1. Verify tenant membership
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

    // 2. Check Idempotency Key (Return cached response on replay)
    const { data: existingKeyRecord } = await (supabase
      .from("idempotency_keys" as any) as any)
      .select("response_status, response_payload")
      .eq("tenant_id", tenantId)
      .eq("key", idempotencyKey)
      .maybeSingle();

    if (existingKeyRecord) {
      // Replay detected: return original cached result with no duplicate side effects
      return NextResponse.json(
        existingKeyRecord.response_payload,
        { status: existingKeyRecord.response_status }
      );
    }

    let resultData: Record<string, unknown> = {};
    const responseStatus = 200;

    // 3. Process Mutation by Type
    if (mutationType === "create_sale") {
      const { data: rpcData, error: rpcError } = await callRpc(supabase, "fn_create_sale", {
        p_tenant_id: tenantId,
        p_store_id: storeId,
        p_location_id: payload.locationId,
        p_customer_id: payload.customerId || null,
        p_cashier_id: user.id,
        p_items: payload.items || [],
        p_cart_discount_type: payload.cartDiscountType || "none",
        p_cart_discount_value: payload.cartDiscountValue || 0,
        p_payments: payload.payments || [],
        p_notes: payload.notes || null,
        p_is_offline_sync: true, // Key: accepts physical sale even if server stock is 0
        p_client_sale_id: outboxId, // Client UUID v7
        p_offline_invoice_number: payload.offlineInvoiceNumber || null,
      });

      if (rpcError) {
        return NextResponse.json(
          { error: rpcError.message },
          { status: 400 }
        );
      }

      resultData = (rpcData as Record<string, unknown>) || {};
    } else if (mutationType === "create_customer") {
      const { data: custData, error: custError } = await (supabase
        .from("customers" as any) as any)
        .insert({
          id: outboxId,
          tenant_id: tenantId,
          name: payload.name,
          phone: payload.phone,
          email: payload.email || null,
          address: payload.address || null,
          opening_balance: payload.openingBalance || 0,
          credit_limit: payload.creditLimit || 0,
        })
        .select()
        .single();

      if (custError) {
        return NextResponse.json({ error: custError.message }, { status: 400 });
      }
      resultData = custData;
    } else if (mutationType === "return_sale") {
      const { data: retData, error: retError } = await callRpc(supabase, "fn_return_sale", {
        p_tenant_id: tenantId,
        p_sale_id: payload.saleId,
        p_store_id: storeId,
        p_location_id: payload.locationId,
        p_items: payload.items || [],
        p_refund_method: payload.refundMethod || "cash",
        p_reason: payload.reason || "Offline Customer Return",
      });

      if (retError) {
        return NextResponse.json({ error: retError.message }, { status: 400 });
      }
      resultData = (retData as Record<string, unknown>) || {};
    } else if (mutationType === "void_sale") {
      const { data: voidData, error: voidError } = await callRpc(supabase, "fn_void_sale", {
        p_tenant_id: tenantId,
        p_sale_id: payload.saleId,
        p_reason: payload.reason || "Offline Void Sale",
      });

      if (voidError) {
        return NextResponse.json({ error: voidError.message }, { status: 400 });
      }
      resultData = (voidData as Record<string, unknown>) || {};
    } else {
      return NextResponse.json(
        { error: `Unsupported mutationType: ${mutationType}` },
        { status: 400 }
      );
    }

    // 4. Save to idempotency_keys
    await (supabase.from("idempotency_keys" as any) as any).insert({
      tenant_id: tenantId,
      key: idempotencyKey,
      resource_type: mutationType,
      response_status: responseStatus,
      response_payload: resultData as any,
    });

    return NextResponse.json(resultData, { status: responseStatus });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Sync push internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
