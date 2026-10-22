import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NotificationService } from "@/lib/notifications/notifier";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || "dokani_cron_secret_step8";

    if (process.env.NODE_ENV !== "test") {
      if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized cron execution" }, { status: 401 });
      }
    }

    const { searchParams } = new URL(req.url);
    const targetDate = searchParams.get("date") || new Date().toISOString().split("T")[0];

    const adminClient = createAdminClient();

    // 1. Fetch all active tenants
    const { data: tenants, error: tenantError } = await adminClient
      .from("tenants")
      .select("id, name")
      .is("deleted_at", null);

    if (tenantError) {
      return NextResponse.json({ error: tenantError.message }, { status: 500 });
    }

    const results: Array<{ tenantId: string; status: string; revenue?: number }> = [];

    for (const tenant of tenants || []) {
      // Fetch owner email
      const { data: ownerMember } = await adminClient
        .from("tenant_members")
        .select("profiles(email, full_name)")
        .eq("tenant_id", tenant.id)
        .eq("role", "owner")
        .maybeSingle();

      const ownerEmail = (ownerMember?.profiles as unknown as { email?: string })?.email;
      if (!ownerEmail) {
        results.push({ tenantId: tenant.id, status: "skipped_no_owner_email" });
        continue;
      }

      // Query sales for targetDate
      const { data: sales } = await adminClient
        .from("sales")
        .select(`
          total_amount,
          paid_amount,
          due_amount,
          items:sale_items(quantity, unit_cost),
          payments:sale_payments(amount, payment_method)
        `)
        .eq("tenant_id", tenant.id)
        .eq("status", "completed")
        .gte("sold_at", `${targetDate}T00:00:00Z`)
        .lte("sold_at", `${targetDate}T23:59:59Z`)
        .is("deleted_at", null);

      let totalRevenuePoisha = 0;
      let costPoisha = 0;
      let totalDuePoisha = 0;
      let cashCollectedPoisha = 0;
      let digitalCollectedPoisha = 0;

      for (const sale of sales || []) {
        totalRevenuePoisha += sale.total_amount;
        totalDuePoisha += sale.due_amount;

        for (const item of (sale.items as unknown as Array<{ quantity: number; unit_cost: number }>) || []) {
          costPoisha += item.quantity * item.unit_cost;
        }

        for (const p of (sale.payments as unknown as Array<{ amount: number; payment_method: string }>) || []) {
          if (p.payment_method === "cash") {
            cashCollectedPoisha += p.amount;
          } else {
            digitalCollectedPoisha += p.amount;
          }
        }
      }

      const grossProfitPoisha = totalRevenuePoisha - costPoisha;

      await NotificationService.notifyDailySummary({
        tenantId: tenant.id,
        tenantName: tenant.name,
        ownerEmail,
        targetDate,
        totalRevenuePoisha,
        grossProfitPoisha,
        invoicesCount: (sales || []).length,
        cashCollectedPoisha,
        digitalCollectedPoisha,
        duePoisha: totalDuePoisha,
      });

      results.push({
        tenantId: tenant.id,
        status: "dispatched",
        revenue: totalRevenuePoisha,
      });
    }

    return NextResponse.json({
      targetDate,
      processedCount: results.length,
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
