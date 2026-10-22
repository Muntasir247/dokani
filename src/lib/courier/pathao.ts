import {
  CourierProvider,
  CourierCredentials,
  CreateParcelParams,
  CreateParcelResult,
  ParcelTrackingResult,
  ShipmentStatus,
} from "./types";
import { sanitizeCourierPayload } from "./sanitization";

export class PathaoCourierProvider implements CourierProvider {
  public readonly name = "pathao" as const;
  private readonly baseUrl: string;

  constructor(baseUrl = "https://api-hermes.pathao.com/aladdin/api/v1") {
    this.baseUrl = baseUrl;
  }

  async createParcel(params: CreateParcelParams, creds: CourierCredentials): Promise<CreateParcelResult> {
    const sanitized = sanitizeCourierPayload({
      recipientName: params.recipientName,
      recipientPhone: params.recipientPhone,
      recipientAddress: params.recipientAddress,
      codAmountBdt: params.codAmountBdt,
    });

    if (process.env.NODE_ENV === "test" || !creds.apiKey) {
      // Mock Sandbox Dispatch for Testing / Development
      const mockConsignmentId = `PTH_CID_${Date.now()}`;
      const mockTrackingCode = `PTH_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

      return {
        success: true,
        consignmentId: mockConsignmentId,
        trackingCode: mockTrackingCode,
        status: "pending",
        deliveryFeeBdt: 80, // Standard ৳80 delivery fee
        rawResponse: {
          mock: true,
          consignment_id: mockConsignmentId,
          tracking_code: mockTrackingCode,
        },
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          store_id: creds.storeId || 1,
          merchant_order_id: params.invoiceNumber,
          recipient_name: sanitized.recipientName,
          recipient_phone: sanitized.recipientPhone,
          recipient_address: sanitized.recipientAddress,
          amount_to_collect: sanitized.codAmountBdt,
          item_type: 2, // Parcel
          special_instruction: params.notes || "",
        }),
      });

      const data = await res.json();

      if (!res.ok || data.type !== "success") {
        return {
          success: false,
          consignmentId: "",
          trackingCode: "",
          status: "in_review",
          error: data.message || "Failed to create parcel on Pathao",
          rawResponse: data,
        };
      }

      const orderData = data.data || {};
      return {
        success: true,
        consignmentId: String(orderData.consignment_id || ""),
        trackingCode: String(orderData.consignment_id || ""),
        status: this.mapPathaoStatus(orderData.order_status),
        deliveryFeeBdt: Number(orderData.delivery_fee || 80),
        rawResponse: data,
      };
    } catch (err: unknown) {
      return {
        success: false,
        consignmentId: "",
        trackingCode: "",
        status: "in_review",
        error: err instanceof Error ? err.message : "Network error contacting Pathao",
      };
    }
  }

  async trackParcel(trackingCode: string, creds: CourierCredentials): Promise<ParcelTrackingResult> {
    if (process.env.NODE_ENV === "test" || !creds.apiKey) {
      return {
        consignmentId: trackingCode,
        trackingCode,
        status: "in_transit",
        updatedAt: new Date().toISOString(),
        timeline: [
          { status: "pending", timestamp: new Date(Date.now() - 3600000).toISOString(), note: "Order placed on Pathao" },
          { status: "in_transit", timestamp: new Date().toISOString(), note: "Assigned to Pathao Rider" },
        ],
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/orders/${trackingCode}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
        },
      });

      const data = await res.json();
      const status = this.mapPathaoStatus(data.data?.order_status);

      return {
        consignmentId: trackingCode,
        trackingCode,
        status,
        updatedAt: new Date().toISOString(),
        timeline: [
          {
            status,
            timestamp: new Date().toISOString(),
            note: data.data?.order_status || "Status updated",
          },
        ],
        rawResponse: data,
      };
    } catch {
      return {
        consignmentId: trackingCode,
        trackingCode,
        status: "in_transit",
        updatedAt: new Date().toISOString(),
        timeline: [],
      };
    }
  }

  async cancelParcel(consignmentId: string, creds: CourierCredentials): Promise<{ success: boolean; message?: string }> {
    if (process.env.NODE_ENV === "test" || !creds.apiKey) {
      return { success: true, message: `Mock Pathao parcel ${consignmentId} cancelled` };
    }

    try {
      const res = await fetch(`${this.baseUrl}/orders/${consignmentId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
        },
      });
      const data = await res.json();
      return { success: res.ok, message: data.message };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : "Network error" };
    }
  }

  public mapPathaoStatus(rawStatus?: string): ShipmentStatus {
    const s = (rawStatus || "").toLowerCase().trim();
    if (s.includes("delivered")) return "delivered";
    if (s.includes("partial")) return "partial_delivered";
    if (s.includes("cancel")) return "cancelled";
    if (s.includes("return")) return "return";
    if (s.includes("pick") || s.includes("assigned")) return "picked";
    if (s.includes("transit") || s.includes("delivery")) return "in_transit";
    if (s.includes("hold")) return "hold";
    return "pending";
  }
}

export class PathaoCourierAdapter {
  private provider: PathaoCourierProvider;
  private creds: CourierCredentials;

  constructor(creds: any = {}, baseUrl?: string) {
    this.provider = new PathaoCourierProvider(baseUrl);
    this.creds = {
      apiKey: creds.apiKey || creds.clientId || "mock_key",
      secretKey: creds.secretKey || creds.clientSecret,
      storeId: creds.storeId || 1,
    };
  }

  async createParcel(params: {
    saleId?: string;
    invoiceNumber: string;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
    codAmountPoisha?: number;
    codAmountBdt?: number;
    notes?: string;
  }) {
    const codAmountBdt =
      params.codAmountBdt ?? (params.codAmountPoisha ? params.codAmountPoisha / 100 : 0);
    const result = await this.provider.createParcel(
      {
        saleId: params.saleId || "unknown",
        invoiceNumber: params.invoiceNumber,
        recipientName: params.recipientName,
        recipientPhone: params.recipientPhone,
        recipientAddress: params.recipientAddress,
        codAmountBdt,
        notes: params.notes,
      },
      this.creds
    );

    return {
      consignmentId: result.consignmentId,
      trackingCode: result.trackingCode,
      status: result.status === "pending" ? "in_transit" : result.status,
      deliveryFeeBdt: result.deliveryFeeBdt,
      rawResponse: result.rawResponse,
    };
  }

  parseWebhookPayload(payload: { order_status?: string; consignment_id?: string; status?: string }) {
    const status = this.provider.mapPathaoStatus(payload.order_status || payload.status);
    return {
      consignmentId: payload.consignment_id || "",
      status,
    };
  }
}

