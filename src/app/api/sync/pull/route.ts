import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/database.types";
import { sanitizeVariantForRole } from "@/lib/auth/permissions";

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
    const storeId = searchParams.get("storeId");
    const cursor = searchParams.get("cursor");
    const limit = Math.min(500, Math.max(50, parseInt(searchParams.get("limit") || "500", 10)));

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    // Check membership
    const { data: memberData, error: memberError } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null; error: { message: string } | null };

    if (memberError || !memberData) {
      return NextResponse.json({ error: "Forbidden: Not a tenant member" }, { status: 403 });
    }

    const role = memberData.role;

    // --- CASE 1: DELTA SYNC (cursor exists) ---
    if (cursor) {
      const { data: rawDeltas, error: deltaErr } = await (supabase
        .from("sync_changes" as any) as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .gt("updated_at", cursor)
        .order("updated_at", { ascending: true })
        .limit(limit);

      if (deltaErr) {
        return NextResponse.json({ error: deltaErr.message }, { status: 500 });
      }

      const deltas = (rawDeltas || []) as Array<{
        op: "INSERT" | "UPDATE" | "DELETE";
        table_name: string;
        record_id: string;
        updated_at: string;
      }>;

      const changes = {
        products: { upserts: [] as any[], deletes: [] as string[] },
        variants: { upserts: [] as any[], deletes: [] as string[] },
        categories: { upserts: [] as any[], deletes: [] as string[] },
        brands: { upserts: [] as any[], deletes: [] as string[] },
        customers: { upserts: [] as any[], deletes: [] as string[] },
        stock_snapshots: { upserts: [] as any[], deletes: [] as string[] },
        serials: { upserts: [] as any[], deletes: [] as string[] },
      };

      if (!deltas || deltas.length === 0) {
        return NextResponse.json({
          hasMore: false,
          nextCursor: cursor,
          changes,
        });
      }

      const nextCursor = deltas[deltas.length - 1].updated_at;
      const hasMore = deltas.length === limit;

      // Group IDs by table
      const upsertIdsByTable: Record<string, string[]> = {};
      for (const d of deltas) {
        if (d.op === "DELETE") {
          if (d.table_name === "products") changes.products.deletes.push(d.record_id);
          else if (d.table_name === "product_variants") changes.variants.deletes.push(d.record_id);
          else if (d.table_name === "categories") changes.categories.deletes.push(d.record_id);
          else if (d.table_name === "brands") changes.brands.deletes.push(d.record_id);
          else if (d.table_name === "customers") changes.customers.deletes.push(d.record_id);
          else if (d.table_name === "product_serials") changes.serials.deletes.push(d.record_id);
        } else {
          if (!upsertIdsByTable[d.table_name]) upsertIdsByTable[d.table_name] = [];
          upsertIdsByTable[d.table_name].push(d.record_id);
        }
      }

      // Fetch upserted records
      if (upsertIdsByTable["products"]?.length > 0) {
        const { data: pData } = await supabase
          .from("products")
          .select("*")
          .in("id", upsertIdsByTable["products"]);
        (pData || []).forEach((p: any) => {
          changes.products.upserts.push({
            id: p.id,
            tenantId: p.tenant_id,
            categoryId: p.category_id,
            brandId: p.brand_id,
            name: p.name,
            unit: p.unit,
            hasVariants: p.has_variants,
            hasSerials: p.has_serials,
            warrantyMonths: p.warranty_months,
            version: p.version,
            updatedAt: p.updated_at,
          });
        });
      }

      if (upsertIdsByTable["product_variants"]?.length > 0) {
        const { data: vData } = await supabase
          .from("product_variants")
          .select("*")
          .in("id", upsertIdsByTable["product_variants"]);
        (vData || []).forEach((v: any) => {
          const sanitized = sanitizeVariantForRole(v, role);
          changes.variants.upserts.push({
            id: sanitized.id,
            productId: sanitized.product_id,
            name: sanitized.name,
            sku: sanitized.sku,
            barcode: sanitized.barcode,
            retailPrice: sanitized.retail_price,
            costPrice: sanitized.cost_price,
            taxRate: sanitized.tax_rate,
            currentStock: 0,
            version: sanitized.version,
            updatedAt: sanitized.updated_at,
          });
        });
      }

      if (upsertIdsByTable["customers"]?.length > 0) {
        const { data: cData } = await supabase
          .from("customers")
          .select("*")
          .in("id", upsertIdsByTable["customers"]);
        (cData || []).forEach((c: any) => {
          changes.customers.upserts.push({
            id: c.id,
            tenantId: c.tenant_id,
            name: c.name,
            phone: c.phone,
            email: c.email,
            currentDue: c.opening_balance,
            creditLimit: c.credit_limit,
            version: c.version,
            updatedAt: c.updated_at,
          });
        });
      }

      if (upsertIdsByTable["product_serials"]?.length > 0) {
        const { data: sData } = await supabase
          .from("product_serials")
          .select("*")
          .in("id", upsertIdsByTable["product_serials"]);
        (sData || []).forEach((s: any) => {
          changes.serials.upserts.push({
            id: s.id,
            variantId: s.variant_id,
            serialNumber: s.serial_number,
            status: s.status,
            updatedAt: s.updated_at,
          });
        });
      }

      return NextResponse.json({
        hasMore,
        nextCursor,
        changes,
      });
    }

    // --- CASE 2: COLD FULL SYNC (no cursor) ---
    // Fetch products and active variants
    const [pRes, catRes, brandRes, custRes, serialRes, stockRes] = await Promise.all([
      supabase
        .from("products")
        .select("*, product_variants(*)")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .limit(limit),
      supabase.from("categories").select("*").eq("tenant_id", tenantId).is("deleted_at", null),
      supabase.from("brands").select("*").eq("tenant_id", tenantId).is("deleted_at", null),
      supabase.from("customers").select("*").eq("tenant_id", tenantId).is("deleted_at", null).limit(limit),
      supabase
        .from("product_serials")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "available")
        .is("deleted_at", null)
        .limit(limit),
      storeId
        ? supabase
            .from("view_current_stock")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("store_id", storeId)
            .limit(limit)
        : supabase
            .from("view_current_stock")
            .select("*")
            .eq("tenant_id", tenantId)
            .limit(limit),
    ]);

    const changes = {
      products: { upserts: [] as any[], deletes: [] as string[] },
      variants: { upserts: [] as any[], deletes: [] as string[] },
      categories: { upserts: [] as any[], deletes: [] as string[] },
      brands: { upserts: [] as any[], deletes: [] as string[] },
      customers: { upserts: [] as any[], deletes: [] as string[] },
      stock_snapshots: { upserts: [] as any[], deletes: [] as string[] },
      serials: { upserts: [] as any[], deletes: [] as string[] },
    };

    (pRes.data || []).forEach((p: any) => {
      changes.products.upserts.push({
        id: p.id,
        tenantId: p.tenant_id,
        categoryId: p.category_id,
        brandId: p.brand_id,
        name: p.name,
        unit: p.unit,
        hasVariants: p.has_variants,
        hasSerials: p.has_serials,
        warrantyMonths: p.warranty_months,
        version: p.version,
        updatedAt: p.updated_at,
      });

      (p.product_variants || []).forEach((v: any) => {
        const sanitized = sanitizeVariantForRole(v, role);
        changes.variants.upserts.push({
          id: sanitized.id,
          productId: p.id,
          name: sanitized.name,
          sku: sanitized.sku,
          barcode: sanitized.barcode,
          retailPrice: sanitized.retail_price,
          costPrice: sanitized.cost_price,
          taxRate: sanitized.tax_rate,
          currentStock: 0,
          version: sanitized.version,
          updatedAt: sanitized.updated_at,
        });
      });
    });

    (catRes.data || []).forEach((c: any) => {
      changes.categories.upserts.push({
        id: c.id,
        tenantId: c.tenant_id,
        name: c.name,
        slug: c.slug,
        version: c.version,
        updatedAt: c.updated_at,
      });
    });

    (brandRes.data || []).forEach((b: any) => {
      changes.brands.upserts.push({
        id: b.id,
        tenantId: b.tenant_id,
        name: b.name,
        version: b.version,
        updatedAt: b.updated_at,
      });
    });

    (custRes.data || []).forEach((c: any) => {
      changes.customers.upserts.push({
        id: c.id,
        tenantId: c.tenant_id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        currentDue: c.opening_balance,
        creditLimit: c.credit_limit,
        version: c.version,
        updatedAt: c.updated_at,
      });
    });

    (serialRes.data || []).forEach((s: any) => {
      changes.serials.upserts.push({
        id: s.id,
        variantId: s.variant_id,
        serialNumber: s.serial_number,
        status: s.status,
        updatedAt: s.updated_at,
      });
    });

    (stockRes.data || []).forEach((st: any) => {
      changes.stock_snapshots.upserts.push({
        variantId: st.variant_id,
        storeId: st.store_id,
        locationId: st.location_id,
        availableStock: Number(st.current_stock) || 0,
        updatedAt: new Date().toISOString(),
      });
    });

    const nowCursor = new Date().toISOString();

    return NextResponse.json({
      hasMore: false,
      nextCursor: nowCursor,
      page: 1,
      totalPages: 1,
      changes,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Sync pull internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
