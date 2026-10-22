import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shareToken: string }> }
) {
  try {
    const { shareToken } = await params;

    if (!shareToken || shareToken.trim().length < 10) {
      return NextResponse.json({ error: "Invalid share token" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await callRpc<{ found: boolean; message?: string }>(
      supabase,
      "fn_get_public_invoice",
      {
        p_share_token: shareToken.trim(),
      }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || !data.found) {
      return NextResponse.json({ error: "Invoice not found or expired" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
