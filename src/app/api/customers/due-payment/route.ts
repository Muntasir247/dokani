import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";
import { PaymentMethod, UserRole } from "@/types/database.types";

const duePaymentSchema = z.object({
  tenantId: z.string().uuid(),
  customerId: z.string().uuid(),
  amountPoisha: z.number().int().positive("Payment amount must be greater than zero"),
  paymentMethod: z.enum(["cash", "bkash", "nagad", "card"]).default("cash"),
  saleId: z.string().uuid().optional().nullable(),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
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
    const parseResult = duePaymentSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tenantId, customerId, amountPoisha, paymentMethod, saleId, reference, notes } =
      parseResult.data;

    // Verify member permissions (owner, manager, cashier can collect payments)
    const { data: memberData } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!memberData) {
      return NextResponse.json(
        { error: "You are not an active member of this store" },
        { status: 403 }
      );
    }

    // Call atomic RPC
    const { data: rpcResult, error: rpcError } = await callRpc(
      supabase,
      "fn_collect_due_payment",
      {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_amount: amountPoisha,
        p_payment_method: paymentMethod as PaymentMethod,
        p_sale_id: saleId || null,
        p_reference: reference || null,
        p_notes: notes || null,
      }
    );

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: rpcResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
