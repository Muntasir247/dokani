import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/permissions";
import { supplierSchema } from "@/lib/validation/catalog";
import { logAuditEvent } from "@/lib/audit";
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

    // Role check: Only manager/owner
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
        { error: "Forbidden: Cashiers cannot view supplier financial balances" },
        { status: 403 }
      );
    }

    // Query supplier due balances from view_supplier_balances
    const { data: suppliers, error } = await supabase
      .from("view_supplier_balances")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ suppliers: suppliers || [] });
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
    const parseResult = supplierSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Role check
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

    try {
      assertPermission(memberData.role, "manage:inventory");
    } catch {
      return NextResponse.json(
        { error: "Forbidden: Cashiers cannot manage suppliers" },
        { status: 403 }
      );
    }

    const { data: newSupplier, error: insertError } = (await (supabase
      .from("suppliers") as any)
      .insert({
        tenant_id: data.tenant_id,
        name: data.name,
        company: data.company || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        opening_balance: data.opening_balance || 0,
        created_by: user.id,
      })
      .select()
      .single()) as { data: Record<string, unknown> & { id: string } | null; error: { message: string } | null };

    if (insertError || !newSupplier) {
      return NextResponse.json({ error: insertError?.message || "Failed to create supplier" }, { status: 400 });
    }

    // Audit log
    await logAuditEvent({
      tenantId: data.tenant_id,
      actorId: user.id,
      action: "supplier_created",
      entityType: "suppliers",
      entityId: newSupplier.id,
      newValues: { name: data.name, opening_balance: data.opening_balance },
    });

    return NextResponse.json({ supplier: newSupplier });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
