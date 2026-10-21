import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseBulkSerials } from "@/lib/inventory/serials";
import { assertPermission } from "@/lib/auth/permissions";
import { UserRole } from "@/types/database.types";

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

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId parameter is required" }, { status: 400 });
    }

    const variantId = searchParams.get("variantId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    let query = supabase
      .from("product_serials")
      .select(`
        id,
        serial_number,
        status,
        warranty_months,
        times_sold,
        sold_at,
        created_at,
        product_variants (
          id,
          name,
          sku,
          products ( name )
        ),
        stock_locations (
          id,
          name,
          stores ( name )
        )
      `)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    if (variantId) {
      query = query.eq("variant_id", variantId);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (search && search.trim()) {
      query = query.ilike("serial_number", `%${search.trim()}%`);
    }

    query = query.order("created_at", { ascending: false }).limit(200);

    const { data: serials, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ serials: serials || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    const { tenantId, variantId, locationId, rawSerials, warrantyMonths = 0 } = body;

    if (!tenantId || !variantId || !locationId || !rawSerials) {
      return NextResponse.json(
        { error: "tenantId, variantId, locationId, and rawSerials are required" },
        { status: 400 }
      );
    }

    // Role check
    const { data: memberData } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!memberData) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
      assertPermission(memberData.role, "manage:inventory");
    } catch {
      return NextResponse.json(
        { error: "Forbidden: Cashiers cannot add serials" },
        { status: 403 }
      );
    }

    const { serials, duplicatesInBatch } = parseBulkSerials(rawSerials);

    if (serials.length === 0) {
      return NextResponse.json({ error: "No valid serial numbers parsed" }, { status: 400 });
    }

    const rowsToInsert = serials.map((sn) => ({
      tenant_id: tenantId,
      variant_id: variantId,
      stock_location_id: locationId,
      serial_number: sn,
      status: "available" as const,
      warranty_months: warrantyMonths,
      created_by: user.id,
    }));

    const { data: inserted, error: insertError } = (await (supabase
      .from("product_serials") as unknown as {
        upsert: (rows: unknown, opts: unknown) => { select: (cols: string) => Promise<{ data: Array<{ id: string; serial_number: string }> | null; error: { message: string } | null }> };
      })
      .upsert(rowsToInsert, { onConflict: "tenant_id,variant_id,serial_number" })
      .select("id, serial_number"));

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({
      insertedCount: inserted?.length || 0,
      duplicatesInBatch,
      message: `Successfully registered ${inserted?.length || 0} serial numbers`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
