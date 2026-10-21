import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
    const tenantId = searchParams.get("tenantId") || req.headers.get("x-tenant-id");
    const variantId = searchParams.get("variantId");

    if (!tenantId || !variantId) {
      return NextResponse.json(
        { error: "tenantId and variantId parameters are required" },
        { status: 400 }
      );
    }

    const { data: serials, error } = await supabase
      .from("product_serials")
      .select("id, serial_number, status, warranty_months")
      .eq("tenant_id", tenantId)
      .eq("variant_id", variantId)
      .eq("status", "available")
      .is("deleted_at", null)
      .order("serial_number", { ascending: true })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ serials: serials || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
