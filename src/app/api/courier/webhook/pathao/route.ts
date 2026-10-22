import { NextRequest, NextResponse } from "next/server";
import { CourierService } from "@/lib/courier/service";
import { PathaoCourierProvider } from "@/lib/courier/pathao";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const consignmentId = body.consignment_id ? String(body.consignment_id) : undefined;
    const rawStatus = body.order_status || body.event;
    const tenantId = body.tenant_id || req.headers.get("x-tenant-id");

    if (!consignmentId) {
      return NextResponse.json({ error: "consignment_id is required" }, { status: 400 });
    }

    const provider = new PathaoCourierProvider();
    const normalizedStatus = provider.mapPathaoStatus(rawStatus);

    await CourierService.handleStatusWebhook({
      tenantId: tenantId || "00000000-0000-0000-0000-000000000000",
      courierName: "pathao",
      consignmentId,
      newStatus: normalizedStatus,
      note: `Pathao status update: ${rawStatus}`,
    });

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
