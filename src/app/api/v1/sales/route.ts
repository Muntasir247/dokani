import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SaleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  discount_amount: z.number().nonnegative().optional().default(0),
  tax_amount: z.number().nonnegative().optional().default(0),
  serial_numbers: z.array(z.string()).optional(),
});

const SalePaymentSchema = z.object({
  payment_method: z.enum(["cash", "card", "bkash", "nagad", "bank_transfer", "due", "credit"]),
  amount: z.number().positive(),
  reference: z.string().optional(),
});

const CreateSaleSchema = z.object({
  store_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  items: z.array(SaleItemSchema).min(1, "At least one sale item is required"),
  payments: z.array(SalePaymentSchema).min(1, "At least one payment record is required"),
  discount_amount: z.number().nonnegative().optional().default(0),
  tax_amount: z.number().nonnegative().optional().default(0),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiKey(req, "read:sales");
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const storeId = searchParams.get("store_id") || searchParams.get("branch_id");
  const customerId = searchParams.get("customer_id");
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  const offset = (page - 1) * limit;
  const admin = createAdminClient();

  let query = admin
    .from("sales")
    .select("*, sale_items(*), sale_payments(*)", { count: "exact" })
    .eq("tenant_id", auth!.tenantId);

  if (storeId) query = query.eq("store_id", storeId);
  if (customerId) query = query.eq("customer_id", customerId);
  if (startDate) query = query.gte("created_at", startDate);
  if (endDate) query = query.lte("created_at", endDate);

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    data: data || [],
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiKey(req, "write:sales");
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = CreateSaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const admin = createAdminClient();
  const idempotencyKey = crypto.randomUUID();

  // Call the transactional POS RPC
  const { data: saleResult, error: rpcError } = await (admin.rpc as any)("fn_create_pos_sale", {
    p_sale_data: {
      tenant_id: auth!.tenantId,
      branch_id: parsed.data.branch_id,
      customer_id: parsed.data.customer_id || null,
      discount_amount: parsed.data.discount_amount,
      tax_amount: parsed.data.tax_amount,
      notes: parsed.data.notes || "Created via REST API v1",
      idempotency_key: idempotencyKey,
      items: parsed.data.items,
      payments: parsed.data.payments,
    },
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  // Trigger outgoing webhook asynchronously
  import("@/lib/webhooks/dispatcher").then(({ webhookDispatcher }) => {
    webhookDispatcher
      .dispatchEvent(auth!.tenantId, "sale.created", saleResult as Record<string, unknown>)
      .catch((err) => console.warn("Failed to dispatch sale.created webhook:", err));
  });

  return NextResponse.json({ data: saleResult }, { status: 201 });
}
