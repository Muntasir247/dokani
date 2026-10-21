import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/permissions";
import { updateProductSchema } from "@/lib/validation/catalog";
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
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    const { data: product, error } = await supabase
      .from("products")
      .select(
        `
        id,
        tenant_id,
        name,
        description,
        image_url,
        unit,
        has_variants,
        has_serials,
        warranty_months,
        is_active,
        category_id,
        brand_id,
        categories ( id, name, slug ),
        brands ( id, name ),
        product_variants (
          id,
          name,
          sku,
          barcode,
          image_url,
          options,
          cost_price,
          retail_price,
          wholesale_price,
          tax_rate,
          reorder_point
        )
      `
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .single();

    if (error || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ product });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
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
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
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
      return NextResponse.json({ error: "Forbidden: Not a member of this store" }, { status: 403 });
    }

    try {
      assertPermission(memberData.role, "manage:catalog");
    } catch {
      return NextResponse.json(
        { error: "Forbidden: Cashiers cannot modify catalog" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parseResult = updateProductSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    const { data: updatedProduct, error: updateErr } = (await (supabase
      .from("products") as any)
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single()) as { data: Record<string, unknown> | null; error: { message: string } | null };

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    // Audit log
    await logAuditEvent({
      tenantId,
      actorId: user.id,
      action: "product_updated",
      entityType: "products",
      entityId: id,
      newValues: data,
    });

    return NextResponse.json({ product: updatedProduct });
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
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
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
      return NextResponse.json({ error: "Forbidden: Not a member of this store" }, { status: 403 });
    }

    try {
      assertPermission(memberData.role, "manage:catalog");
    } catch {
      return NextResponse.json(
        { error: "Forbidden: Cashiers cannot delete catalog items" },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    // Soft delete product and variants
    await (supabase
      .from("product_variants") as any)
      .update({ deleted_at: now })
      .eq("product_id", id)
      .eq("tenant_id", tenantId);

    const { error: delErr } = await (supabase
      .from("products") as any)
      .update({ deleted_at: now })
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }

    // Audit log
    await logAuditEvent({
      tenantId,
      actorId: user.id,
      action: "product_deleted",
      entityType: "products",
      entityId: id,
    });

    return NextResponse.json({ success: true, message: "Product archived successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
