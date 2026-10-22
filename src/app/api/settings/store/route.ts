import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserRole, Database } from "@/types/database.types";

const storeSettingsUpdateSchema = z.object({
  tenantId: z.string().uuid(),
  storeId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  vatBinNumber: z.string().max(50).optional().nullable(),
  receiptFooter: z.string().max(500).optional().nullable(),
  invoicePrefix: z.string().max(20).optional().nullable(),
  defaultPaperSize: z.enum(["80mm", "a4"]).optional(),
  logoUrl: z.string().url().max(1000).optional().nullable().or(z.literal("")),
  paymentTerms: z.string().max(500).optional().nullable(),
  bankDetails: z.string().max(1000).optional().nullable(),
  taxEnabled: z.boolean().optional(),
  defaultTaxRate: z.number().min(0).max(100).optional(),
  defaultCurrency: z.string().min(1).max(10).optional(),
  loyaltyEnabled: z.boolean().optional(),
  loyaltyEarnRatePoisha: z.number().int().min(0).optional(),
  loyaltyRedeemRatePoisha: z.number().int().min(0).optional(),
});

type StoreUpdate = Database["public"]["Tables"]["stores"]["Update"];

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

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId parameter is required" }, { status: 400 });
    }

    let query = supabase.from("stores").select("*").eq("tenant_id", tenantId).is("deleted_at", null);

    if (storeId) {
      query = query.eq("id", storeId);
    } else {
      query = query.eq("is_main", true);
    }

    const { data: store, error } = await query.single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ store });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
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
    const parseResult = storeSettingsUpdateSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tenantId, storeId, ...fields } = parseResult.data;

    // Check permissions (manager or owner)
    const { data: member } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!member || (member.role !== "owner" && member.role !== "manager")) {
      return NextResponse.json(
        { error: "Forbidden: Only owners and managers can update store settings" },
        { status: 403 }
      );
    }

    const updatePayload: StoreUpdate = {
      updated_at: new Date().toISOString(),
    };

    if (fields.name !== undefined) updatePayload.name = fields.name;
    if (fields.phone !== undefined) updatePayload.phone = fields.phone;
    if (fields.address !== undefined) updatePayload.address = fields.address;
    if (fields.vatBinNumber !== undefined) updatePayload.vat_bin_number = fields.vatBinNumber;
    if (fields.receiptFooter !== undefined) updatePayload.receipt_footer = fields.receiptFooter;
    if (fields.invoicePrefix !== undefined) updatePayload.invoice_prefix = fields.invoicePrefix;
    if (fields.defaultPaperSize !== undefined) updatePayload.default_paper_size = fields.defaultPaperSize;
    if (fields.logoUrl !== undefined) updatePayload.logo_url = fields.logoUrl || null;
    if (fields.paymentTerms !== undefined) updatePayload.payment_terms = fields.paymentTerms;
    if (fields.bankDetails !== undefined) updatePayload.bank_details = fields.bankDetails;
    if (fields.taxEnabled !== undefined) updatePayload.tax_enabled = fields.taxEnabled;
    if (fields.defaultTaxRate !== undefined) updatePayload.default_tax_rate = fields.defaultTaxRate;
    if (fields.defaultCurrency !== undefined) updatePayload.default_currency = fields.defaultCurrency;
    if (fields.loyaltyEnabled !== undefined) updatePayload.loyalty_enabled = fields.loyaltyEnabled;
    if (fields.loyaltyEarnRatePoisha !== undefined)
      updatePayload.loyalty_earn_rate_poisha = fields.loyaltyEarnRatePoisha;
    if (fields.loyaltyRedeemRatePoisha !== undefined)
      updatePayload.loyalty_redeem_rate_poisha = fields.loyaltyRedeemRatePoisha;

    const { data: updatedStore, error: updateError } = await supabase
      .from("stores")
      .update(updatePayload as never)
      .eq("id", storeId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, store: updatedStore });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
