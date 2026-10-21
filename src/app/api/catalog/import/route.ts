import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/permissions";
import { validateProductCSV } from "@/lib/catalog/csv";
import { logAuditEvent } from "@/lib/audit";
import { UserRole } from "@/types/database.types";

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
    const { tenantId, csvContent, dryRun = true } = body;

    if (!tenantId || !csvContent) {
      return NextResponse.json(
        { error: "tenantId and csvContent are required" },
        { status: 400 }
      );
    }

    // Verify manager/owner role
    const { data: memberData } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!memberData) {
      return NextResponse.json({ error: "Forbidden: Not a member of this tenant" }, { status: 403 });
    }

    try {
      assertPermission(memberData.role, "manage:catalog");
    } catch {
      return NextResponse.json(
        { error: "Forbidden: Cashiers cannot import catalog data" },
        { status: 403 }
      );
    }

    // Query existing SKUs in this tenant for collision prevention
    const { data: existingRows } = await (supabase
      .from("product_variants") as any)
      .select("sku")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    const existingSKUs = new Set<string>(((existingRows as Array<{ sku: string }>) || []).map((r) => r.sku));

    // Execute validation engine
    const report = validateProductCSV(csvContent, existingSKUs, dryRun);

    // If dryRun mode or if validation errors were detected, return report without importing
    if (dryRun || report.errorCount > 0) {
      return NextResponse.json({ report });
    }

    // Commit valid rows to database
    const { data: defaultLocation } = (await (supabase
      .from("stock_locations") as any)
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_default", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { id: string } | null };

    // Cache categories & brands to minimize queries
    const { data: existingCategories } = (await supabase
      .from("categories")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)) as { data: Array<{ id: string; name: string }> | null };

    const categoryMap = new Map<string, string>();
    (existingCategories || []).forEach((c) => categoryMap.set(c.name.toLowerCase(), c.id));

    const { data: existingBrands } = (await supabase
      .from("brands")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)) as { data: Array<{ id: string; name: string }> | null };

    const brandMap = new Map<string, string>();
    (existingBrands || []).forEach((b) => brandMap.set(b.name.toLowerCase(), b.id));

    let importedCount = 0;

    for (const item of report.validRows) {
      // 1. Resolve category
      let categoryId: string | null = null;
      if (item.categoryName) {
        const catKey = item.categoryName.toLowerCase();
        if (categoryMap.has(catKey)) {
          categoryId = categoryMap.get(catKey)!;
        } else {
          const slug = catKey.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const { data: newCat } = (await (supabase
            .from("categories") as any)
            .insert({ tenant_id: tenantId, name: item.categoryName, slug, created_by: user.id })
            .select("id")
            .single()) as { data: { id: string } | null };
          if (newCat) {
            categoryId = newCat.id;
            categoryMap.set(catKey, newCat.id);
          }
        }
      }

      // 2. Resolve brand
      let brandId: string | null = null;
      if (item.brandName) {
        const brandKey = item.brandName.toLowerCase();
        if (brandMap.has(brandKey)) {
          brandId = brandMap.get(brandKey)!;
        } else {
          const { data: newBrand } = (await (supabase
            .from("brands") as any)
            .insert({ tenant_id: tenantId, name: item.brandName, created_by: user.id })
            .select("id")
            .single()) as { data: { id: string } | null };
          if (newBrand) {
            brandId = newBrand.id;
            brandMap.set(brandKey, newBrand.id);
          }
        }
      }

      // 3. Create product
      const { data: product, error: pErr } = (await (supabase
        .from("products") as any)
        .insert({
          tenant_id: tenantId,
          category_id: categoryId,
          brand_id: brandId,
          name: item.name,
          unit: item.unit,
          has_variants: false,
          has_serials: item.hasSerials,
          warranty_months: item.warrantyMonths,
          created_by: user.id,
        })
        .select("id")
        .single()) as { data: { id: string } | null; error: unknown };

      if (pErr || !product) continue;

      // 4. Create variant
      const { data: variant, error: vErr } = (await (supabase
        .from("product_variants") as any)
        .insert({
          tenant_id: tenantId,
          product_id: product.id,
          name: "Standard",
          sku: item.sku,
          barcode: item.barcode,
          cost_price: item.costPricePoisha,
          retail_price: item.retailPricePoisha,
          wholesale_price: item.wholesalePricePoisha,
          tax_rate: item.taxRate,
          reorder_point: item.reorderPoint,
          created_by: user.id,
        })
        .select("id")
        .single()) as { data: { id: string } | null; error: unknown };

      if (vErr || !variant) continue;

      // 5. Opening stock ledger movement
      if (item.openingStock > 0 && defaultLocation) {
        await (supabase.from("stock_movements") as any).insert({
          tenant_id: tenantId,
          location_id: defaultLocation.id,
          variant_id: variant.id,
          type: "adjustment",
          quantity: item.openingStock,
          unit_cost: item.costPricePoisha,
          reference_type: "opening_stock",
          notes: "CSV Import opening stock",
          created_by: user.id,
        });
      }

      importedCount++;
    }

    // Audit log
    await logAuditEvent({
      tenantId,
      actorId: user.id,
      action: "csv_import_completed",
      entityType: "products",
      entityId: tenantId,
      newValues: {
        totalRows: report.totalRows,
        importedCount,
      },
    });

    return NextResponse.json({
      report: {
        ...report,
        imported: true,
        validCount: importedCount,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
