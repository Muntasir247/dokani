import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/permissions";
import { supplierSchema } from "@/lib/validation/catalog";
import { logAuditEvent } from "@/lib/audit";
import { UserRole } from "@/types/database.types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || req.headers.get("x-tenant-id");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId parameter is required" }, { status: 400 });
    }

    const { data: supplier, error } = await supabase
      .from("view_supplier_balances")
      .select("*")
      .eq("supplier_id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    return NextResponse.json({ supplier });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
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
        { error: "Forbidden: Cashiers cannot edit suppliers" },
        { status: 403 }
      );
    }

    const { data: updated, error } = (await (supabase
      .from("suppliers") as any)
      .update({
        name: data.name,
        company: data.company || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        opening_balance: data.opening_balance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", data.tenant_id)
      .select()
      .single()) as { data: Record<string, unknown> | null; error: { message: string } | null };

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Audit log
    await logAuditEvent({
      tenantId: data.tenant_id,
      actorId: user.id,
      action: "supplier_updated",
      entityType: "suppliers",
      entityId: id,
      newValues: data,
    });

    return NextResponse.json({ supplier: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || req.headers.get("x-tenant-id");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId parameter is required" }, { status: 400 });
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
        { error: "Forbidden: Cashiers cannot delete suppliers" },
        { status: 403 }
      );
    }

    const { error } = await (supabase
      .from("suppliers") as any)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Audit log
    await logAuditEvent({
      tenantId,
      actorId: user.id,
      action: "supplier_deleted",
      entityType: "suppliers",
      entityId: id,
    });

    return NextResponse.json({ success: true, message: "Supplier archived successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
