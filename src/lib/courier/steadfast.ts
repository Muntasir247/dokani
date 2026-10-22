import {
  CourierProvider,
  CourierCredentials,
  CreateParcelParams,
  CreateParcelResult,
  ParcelTrackingResult,
  ShipmentStatus,
} from "./types";
import { sanitizeCourierPayload } from "./sanitization";

export class SteadfastCourierProvider implements CourierProvider {
  public readonly name = "steadfast" as const;
  private readonly baseUrl: string;

  constructor(baseUrl = "https://portal.steadfast.com.bd/api/v1") {
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
      const mockConsignmentId = `STF_CID_${Date.now()}`;
      const mockTrackingCode = `STF_TRK_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

      return {
        success: true,
        consignmentId: mockConsignmentId,
        trackingCode: mockTrackingCode,
        status: "pending",
        deliveryFeeBdt: 70, // Standard ৳70 delivery fee in Dhaka
        rawResponse: {
          mock: true,
          consignment_id: mockConsignmentId,
          tracking_code: mockTrackingCode,
        },
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/create_order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": creds.apiKey,
          "Secret-Key": creds.secretKey || "",
        },
        body: JSON.stringify({
          invoice: params.invoiceNumber,
          recipient_name: sanitized.recipientName,
          recipient_phone: sanitized.recipientPhone,
          recipient_address: sanitized.recipientAddress,
          cod_amount: sanitized.codAmountBdt,
          note: params.notes || "Handle with care",
        }),
      });

      const data = await res.json();

      if (!res.ok || data.status !== 200) {
        return {
          success: false,
          consignmentId: "",
          trackingCode: "",
          status: "in_review",
          error: data.message || "Failed to create parcel on Steadfast",
          rawResponse: data,
        };
      }

      const consignment = data.consignment || {};
      return {
        success: true,
        consignmentId: String(consignment.consignment_id || consignment.id),
        trackingCode: String(consignment.tracking_code),
        status: this.mapSteadfastStatus(consignment.status),
        deliveryFeeBdt: 70,
        rawResponse: data,
      };
    } catch (err: unknown) {
      return {
        success: false,
        consignmentId: "",
        trackingCode: "",
        status: "in_review",
        error: err instanceof Error ? err.message : "Network error contacting Steadfast",
      };
    }
  }

  async trackParcel(trackingCode: string, creds: CourierCredentials): Promise<ParcelTrackingResult> {
    if (process.env.NODE_ENV === "test" || !creds.apiKey) {
      return {
        consignmentId: `MOCK_CID_${trackingCode}`,
        trackingCode,
        status: "in_transit",
        updatedAt: new Date().toISOString(),
        timeline: [
          { status: "pending", timestamp: new Date(Date.now() - 3600000).toISOString(), note: "Parcel booked with Steadfast" },
          { status: "picked", timestamp: new Date(Date.now() - 1800000).toISOString(), note: "Rider picked up parcel" },
          { status: "in_transit", timestamp: new Date().toISOString(), note: "Parcel in transit to delivery hub" },
        ],
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/status_by_trackingcode/${trackingCode}`, {
        method: "GET",
        headers: {
          "Api-Key": creds.apiKey,
          "Secret-Key": creds.secretKey || "",
        },
      });

      const data = await res.json();
      const status = this.mapSteadfastStatus(data.delivery_status);

      return {
        consignmentId: String(data.consignment_id || ""),
        trackingCode,
        status,
        updatedAt: new Date().toISOString(),
        timeline: [
          {
            status,
            timestamp: new Date().toISOString(),
            note: data.delivery_status || "Status updated",
          },
        ],
        rawResponse: data,
      };
    } catch {
      return {
        consignmentId: "",
        trackingCode,
        status: "in_transit",
        updatedAt: new Date().toISOString(),
        timeline: [],
      };
    }
  }

  async cancelParcel(consignmentId: string, creds: CourierCredentials): Promise<{ success: boolean; message?: string }> {
    if (process.env.NODE_ENV === "test" || !creds.apiKey) {
      return { success: true, message: `Mock consignment ${consignmentId} cancelled` };
    }

    try {
      const res = await fetch(`${this.baseUrl}/cancel_order/${consignmentId}`, {
        method: "POST",
        headers: {
          "Api-Key": creds.apiKey,
          "Secret-Key": creds.secretKey || "",
        },
      });
      const data = await res.json();
      return { success: res.ok && data.status === 200, message: data.message };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : "Network error" };
    }
  }

  public mapSteadfastStatus(rawStatus?: string): ShipmentStatus {
    const s = (rawStatus || "").toLowerCase().trim();
    if (s.includes("delivered")) return "delivered";
    if (s.includes("partial")) return "partial_delivered";
    if (s.includes("cancel")) return "cancelled";
    if (s.includes("return")) return "return";
    if (s.includes("pick") || s.includes("received")) return "picked";
    if (s.includes("transit") || s.includes("out_for_delivery")) return "in_transit";
    if (s.includes("hold")) return "hold";
    return "pending";
  }
}

export class SteadfastCourierAdapter {
  private provider: SteadfastCourierProvider;
  private creds: CourierCredentials;

  constructor(creds: Partial<CourierCredentials> = {}, baseUrl?: string) {
    this.provider = new SteadfastCourierProvider(baseUrl);
    this.creds = {
      apiKey: creds.apiKey || "",
      secretKey: creds.secretKey,
      storeId: creds.storeId,
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
    itemDescription?: string;
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
        notes: params.notes || params.itemDescription,
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

  parseWebhookPayload(payload: { consignment_id?: string; status?: string; delivery_status?: string }) {
    const status = this.provider.mapSteadfastStatus(payload.status || payload.delivery_status);
    return {
      consignmentId: payload.consignment_id || "",
      status,
    };
  }
}

