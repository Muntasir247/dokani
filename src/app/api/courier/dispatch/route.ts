import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CourierService } from "@/lib/courier/service";
import { CourierProviderName } from "@/lib/courier/types";

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
      tenantId,
      storeId,
      saleId,
      courierName,
      recipientName,
      recipientPhone,
      recipientAddress,
      codAmountBdt,
      notes,
    } = body;

    if (!tenantId || !storeId || !saleId || !courierName || !recipientName || !recipientPhone || !recipientAddress) {
      return NextResponse.json(
        { error: "Missing required courier dispatch fields" },
        { status: 400 }
      );
    }

    const result = await CourierService.dispatchSaleParcel({
      tenantId,
      storeId,
      saleId,
      courierName: courierName as CourierProviderName,
      recipientName,
      recipientPhone,
      recipientAddress,
      codAmountBdt: codAmountBdt !== undefined ? Number(codAmountBdt) : undefined,
      notes,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Courier dispatch failed" }, { status: 400 });
    }

    return NextResponse.json({ success: true, parcel: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Duplicate dispatch") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
