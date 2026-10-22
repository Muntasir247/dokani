import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { UserRole } from "@/types/database.types";
import { assertFeatureEnabled } from "@/lib/billing/guard";
import { generateCsv } from "@/features/reports/csv-export";

interface TaxRow {
  invoiceNumber: string;
  soldAt: string;
  subtotalPoisha: number;
  discountPoisha: number;
  taxableAmountPoisha: number;
  taxAmountPoisha: number;
  totalAmountPoisha: number;
}

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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId parameter is required" }, { status: 400 });
    }

    // Check membership and role
    const { data: memberData, error: memberError } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null; error: { message: string } | null };

    if (memberError || !memberData) {
      return NextResponse.json({ error: "Forbidden: Not a store member" }, { status: 403 });
    }

    const role = memberData.role;

    if (!can(role, "view:reports")) {
      return NextResponse.json(
        { error: "Forbidden: Cashiers do not have permission to view tax reports" },
        { status: 403 }
      );
    }

    // Fetch store VAT/BIN number
    const { data: storeData } = (await supabase
      .from("stores")
      .select("vat_bin_number, name")
      .eq("tenant_id", tenantId)
      .maybeSingle()) as { data: { vat_bin_number: string | null; name: string } | null };

    let query = supabase
      .from("sales")
      .select("invoice_number, sold_at, subtotal, discount_amount, tax_amount, total_amount")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .is("deleted_at", null);

    if (storeId) {
      query = query.eq("store_id", storeId);
    }
    if (startDate) {
      query = query.gte("sold_at", `${startDate}T00:00:00Z`);
    }
    if (endDate) {
      query = query.lte("sold_at", `${endDate}T23:59:59Z`);
    }

    const { data: sales, error: salesError } = (await query) as {
      data: Array<{
        invoice_number: string;
        sold_at: string;
        subtotal: number;
        discount_amount: number;
        tax_amount: number;
        total_amount: number;
      }> | null;
      error: { message: string } | null;
    };

    if (salesError) {
      return NextResponse.json({ error: salesError.message }, { status: 400 });
    }

    let totalTaxablePoisha = 0;
    let totalTaxPoisha = 0;
    let totalGrossPoisha = 0;

    const rows: TaxRow[] = (sales || []).map((s) => {
      const taxable = s.subtotal - s.discount_amount;
      totalTaxablePoisha += taxable;
      totalTaxPoisha += s.tax_amount;
      totalGrossPoisha += s.total_amount;

      return {
        invoiceNumber: s.invoice_number,
        soldAt: s.sold_at,
        subtotalPoisha: s.subtotal,
        discountPoisha: s.discount_amount,
        taxableAmountPoisha: taxable,
        taxAmountPoisha: s.tax_amount,
        totalAmountPoisha: s.total_amount,
      };
    });

    // CSV export
    if (searchParams.get("export") === "csv") {
      await assertFeatureEnabled(supabase, tenantId, "exportReports");
      const csv = generateCsv<TaxRow>(
        [
          { header: "Invoice #", accessor: (r) => r.invoiceNumber },
          { header: "Date", accessor: (r) => r.soldAt },
          { header: "Subtotal (BDT)", accessor: (r) => (r.subtotalPoisha / 100).toFixed(2) },
          { header: "Discount (BDT)", accessor: (r) => (r.discountPoisha / 100).toFixed(2) },
          { header: "Taxable Base (BDT)", accessor: (r) => (r.taxableAmountPoisha / 100).toFixed(2) },
          { header: "VAT Collected (BDT)", accessor: (r) => (r.taxAmountPoisha / 100).toFixed(2) },
          { header: "Invoice Total (BDT)", accessor: (r) => (r.totalAmountPoisha / 100).toFixed(2) },
        ],
        rows
      );

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="tax-summary-${tenantId}.csv"`,
        },
      });
    }

    return NextResponse.json({
      storeName: storeData?.name || "Dokani Store",
      vatBinNumber: storeData?.vat_bin_number || "N/A",
      summary: {
        invoicesCount: rows.length,
        totalTaxablePoisha,
        totalTaxPoisha,
        totalGrossPoisha,
      },
      rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
