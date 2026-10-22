import { NextRequest, NextResponse } from "next/server";
import { CourierService } from "@/lib/courier/service";
import { SteadfastCourierProvider } from "@/lib/courier/steadfast";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Steadfast sends consignment_id or tracking_code and status
    const consignmentId = body.consignment_id ? String(body.consignment_id) : undefined;
    const trackingCode = body.tracking_code ? String(body.tracking_code) : undefined;
    const rawStatus = body.status || body.delivery_status;
    const tenantId = body.tenant_id || req.headers.get("x-tenant-id");

    if (!consignmentId && !trackingCode) {
      return NextResponse.json({ error: "consignment_id or tracking_code is required" }, { status: 400 });
    }

    const provider = new SteadfastCourierProvider();
    const normalizedStatus = provider.mapSteadfastStatus(rawStatus);

    await CourierService.handleStatusWebhook({
      tenantId: tenantId || "00000000-0000-0000-0000-000000000000",
      courierName: "steadfast",
      consignmentId,
      trackingCode,
      newStatus: normalizedStatus,
      note: `Steadfast status update: ${rawStatus}`,
    });

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
