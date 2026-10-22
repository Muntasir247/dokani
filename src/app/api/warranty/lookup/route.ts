import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";

const serialQuerySchema = z.string().trim().min(2).max(100);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawSerial = searchParams.get("serial") || "";
    const parseResult = serialQuerySchema.safeParse(rawSerial);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "A valid serial number or IMEI between 2 and 100 characters is required" },
        { status: 400 }
      );
    }

    const serialNumber = parseResult.data;
    const supabase = await createServerSupabaseClient();

    const { data, error } = await callRpc(supabase, "fn_lookup_warranty", {
      p_serial_number: serialNumber,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = serialQuerySchema.safeParse(body?.serial);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "A valid serial number or IMEI between 2 and 100 characters is required" },
        { status: 400 }
      );
    }

    const serialNumber = parseResult.data;
    const supabase = await createServerSupabaseClient();

    const { data, error } = await callRpc(supabase, "fn_lookup_warranty", {
      p_serial_number: serialNumber,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
