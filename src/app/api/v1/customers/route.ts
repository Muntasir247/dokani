import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeBDPhone } from "@/lib/courier/sanitization";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateCustomerSchema = z.object({
  name: z.string().min(1, "Customer name is required").max(100),
  phone: z.string().min(10, "Valid phone number required"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(255).optional(),
  price_tier: z.enum(["retail", "wholesale", "custom"]).optional().default("retail"),
  credit_limit: z.number().nonnegative().optional().default(0),
  opening_due: z.number().nonnegative().optional().default(0),
});

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiKey(req, "read:customers");
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const query = searchParams.get("query")?.trim();

  const offset = (page - 1) * limit;
  const admin = createAdminClient();

  let queryBuilder = admin
    .from("customers")
    .select("id, name, phone, email, address, price_tier, credit_limit, loyalty_points, created_at, updated_at", { count: "exact" })
    .eq("tenant_id", auth!.tenantId);

  if (query) {
    queryBuilder = queryBuilder.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
  }

  const { data, count, error } = await queryBuilder
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
  const { auth, errorResponse } = await authenticateApiKey(req, "write:customers");
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = CreateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  // Clean Bangladesh phone format
  const sanitizedPhone = sanitizeBDPhone(parsed.data.phone);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .insert({
      tenant_id: auth!.tenantId,
      name: parsed.data.name.trim(),
      phone: sanitizedPhone,
      email: parsed.data.email?.trim() || null,
      address: parsed.data.address?.trim() || null,
      price_tier: parsed.data.price_tier,
      credit_limit: parsed.data.credit_limit,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
