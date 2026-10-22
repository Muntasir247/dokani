import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(req.url);
    const saleId = searchParams.get("saleId");
    const trackingCode = searchParams.get("trackingCode");
    const tenantId = searchParams.get("tenantId") || req.headers.get("x-tenant-id");

    if (!tenantId || (!saleId && !trackingCode)) {
      return NextResponse.json(
        { error: "tenantId and either saleId or trackingCode are required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("shipments")
      .select(`
        id,
        sale_id,
        store_id,
        courier_provider,
        consignment_id,
        tracking_code,
        status,
        recipient_name,
        recipient_phone,
        recipient_address,
        cod_amount_poisha,
        delivery_fee_poisha,
        timeline,
        created_at,
        updated_at
      `)
      .eq("tenant_id", tenantId);

    if (saleId) {
      query = query.eq("sale_id", saleId);
    } else if (trackingCode) {
      query = query.eq("tracking_code", trackingCode);
    }

    const { data: shipment, error } = (await query.maybeSingle()) as {
      data: {
        id: string;
        sale_id: string;
        store_id: string;
        courier_provider: string;
        consignment_id: string;
        tracking_code: string;
        status: string;
        recipient_name: string;
        recipient_phone: string;
        recipient_address: string;
        cod_amount_poisha: number;
        delivery_fee_poisha: number;
        timeline: Array<{ status: string; timestamp: string; note: string }>;
        created_at: string;
        updated_at: string;
      } | null;
      error: { message: string } | null;
    };

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ shipment });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
