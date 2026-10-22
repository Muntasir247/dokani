import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPlanConfig, calculateProration, BillingInterval } from "@/lib/billing/plan-config";
import { getPaymentProvider, PaymentProviderName } from "@/lib/billing/providers";
import { PlanTier, UserRole } from "@/types/database.types";

const checkoutSchema = z.object({
  tenantId: z.string().uuid(),
  planTier: z.enum(["pro", "business"]),
  billingInterval: z.enum(["month", "year"]).default("month"),
  provider: z.enum(["sslcommerz", "bkash"]).default("sslcommerz"),
});

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
    const parseResult = checkoutSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tenantId, planTier, billingInterval, provider } = parseResult.data;

    // Verify owner role
    const { data: memberData } = (await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()) as { data: { role: UserRole } | null };

    if (!memberData || memberData.role !== "owner") {
      return NextResponse.json(
        { error: "Forbidden: Only store owners can upgrade or manage billing" },
        { status: 403 }
      );
    }

    // Get current subscription
    const { data: subData } = (await supabase
      .from("subscriptions")
      .select("plan_tier, current_period_start, current_period_end")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .maybeSingle()) as {
      data: {
        plan_tier: PlanTier;
        current_period_start: string | null;
        current_period_end: string | null;
      } | null;
    };

    const currentTier = (subData?.plan_tier || "free") as PlanTier;
    const targetPlan = getPlanConfig(planTier);

    // Calculate payable amount with proration if currently on paid plan
    let amountPoisha =
      billingInterval === "year"
        ? targetPlan.yearlyPricePoisha
        : targetPlan.monthlyPricePoisha;

    if (
      currentTier !== "free" &&
      subData?.current_period_end &&
      new Date(subData.current_period_end) > new Date()
    ) {
      const now = new Date();
      const periodEnd = new Date(subData.current_period_end);
      const periodStart = subData.current_period_start
        ? new Date(subData.current_period_start)
        : new Date();
      const totalDays = Math.max(
        1,
        Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24))
      );
      const remainingDays = Math.max(
        0,
        Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );

      const proration = calculateProration(
        currentTier,
        planTier,
        billingInterval as BillingInterval,
        remainingDays,
        totalDays
      );
      amountPoisha = proration.netPayablePoisha;
    }

    // Fetch user profile for contact details
    const { data: profile } = (await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle()) as {
      data: {
        full_name: string | null;
        email: string | null;
        phone: string | null;
      } | null;
    };

    const origin = req.nextUrl.origin || "http://localhost:3000";
    const paymentGateway = getPaymentProvider(provider as PaymentProviderName);

    const session = await paymentGateway.createCheckoutSession({
      tenantId,
      planTier,
      billingInterval: billingInterval as BillingInterval,
      amountPoisha,
      currency: "BDT",
      customerName: profile?.full_name || "Store Owner",
      customerEmail: profile?.email || user.email || "owner@dokani.app",
      customerPhone: profile?.phone || "01700000000",
      successUrl: `${origin}/api/billing/webhook/${provider}?status=success&tenantId=${tenantId}&plan=${planTier}&interval=${billingInterval}&amount=${amountPoisha}`,
      failUrl: `${origin}/settings/billing?status=failed`,
      cancelUrl: `${origin}/settings/billing?status=canceled`,
      ipnUrl: `${origin}/api/billing/webhook/${provider}`,
    });

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      gatewayUrl: session.gatewayUrl,
      provider: session.provider,
      transactionId: session.transactionId,
      amountPoisha,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
