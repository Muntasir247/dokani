import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { quickCustomerSchema } from "@/lib/validation/pos";
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
    const query = searchParams.get("q") || "";

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId parameter is required" }, { status: 400 });
    }

    // Query customer balances view
    let dbQuery = supabase
      .from("view_customer_balances")
      .select("customer_id, tenant_id, name, phone, email, address, credit_limit, opening_balance, current_due")
      .eq("tenant_id", tenantId);

    if (query.trim()) {
      dbQuery = dbQuery.or(`name.ilike.%${query.trim()}%,phone.ilike.%${query.trim()}%`);
    }

    const { data: customers, error } = await dbQuery
      .order("name", { ascending: true })
      .limit(30);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ customers: customers || [] });
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
    const parseResult = quickCustomerSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Verify tenant membership
    const { data: memberData } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", data.tenant_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!memberData) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: newCustomer, error: insertError } = (await (supabase
      .from("customers") as any)
      .insert({
        tenant_id: data.tenant_id,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        address: data.address || null,
        credit_limit: data.credit_limit,
        opening_balance: data.opening_balance,
        created_by: user.id,
      })
      .select()
      .single()) as { data: Record<string, unknown> | null; error: { message: string } | null };

    if (insertError || !newCustomer) {
      return NextResponse.json(
        { error: insertError?.message || "Failed to create customer" },
        { status: 400 }
      );
    }

    return NextResponse.json({ customer: newCustomer }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
