import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SteadfastCourierProvider } from "./steadfast";
import { PathaoCourierProvider } from "./pathao";
import {
  CourierProvider,
  CourierProviderName,
  CreateParcelParams,
  CreateParcelResult,
  ShipmentStatus,
} from "./types";
import { decryptCredential } from "./encryption";

export class CourierService {
  private static providers: Record<CourierProviderName, CourierProvider> = {
    steadfast: new SteadfastCourierProvider(),
    pathao: new PathaoCourierProvider(),
    custom: new SteadfastCourierProvider(),
  };

  private supabaseClient?: any;

  constructor(supabaseClient?: any) {
    this.supabaseClient = supabaseClient;
  }

  async dispatchSaleParcel(params: any): Promise<CreateParcelResult> {
    return CourierService.dispatchSaleParcel(params, this.supabaseClient);
  }

  /**
   * Retrieves provider instance by name.
   */
  static getProvider(name: CourierProviderName): CourierProvider {
    const provider = this.providers[name];
    if (!provider) {
      throw new Error(`Unsupported courier provider: ${name}`);
    }
    return provider;
  }

  /**
   * Dispatches a parcel for a sale with strict DUPLICATE-DISPATCH GUARD.
   * Acceptance Criterion: Dispatching the same sale to the courier twice never creates two parcels.
   */
  static async dispatchSaleParcel(
    params: {
      tenantId: string;
      storeId?: string;
      saleId: string;
      courierName?: CourierProviderName;
      courierProvider?: CourierProviderName;
      recipientName: string;
      recipientPhone: string;
      recipientAddress: string;
      codAmountBdt?: number;
      codAmountPoisha?: number;
      invoiceNumber?: string;
      notes?: string;
    },
    client?: any
  ): Promise<CreateParcelResult> {
    const supabase = client || (await createServerSupabaseClient());
    const courierProvider = (params.courierName || params.courierProvider || "steadfast") as CourierProviderName;
    const codAmountBdt =
      params.codAmountBdt ?? (params.codAmountPoisha ? params.codAmountPoisha / 100 : 0);

    // 1. DUPLICATE-DISPATCH GUARD (Pre-check)
    // Check if an active shipment already exists for this sale
    const { data: existingShipment } = (await supabase
      .from("shipments")
      .select("id, consignment_id, tracking_code, status, courier_provider")
      .eq("tenant_id", params.tenantId)
      .eq("sale_id", params.saleId)
      .not("status", "in", '("cancelled","return")')
      .maybeSingle()) as {
      data: {
        id: string;
        consignment_id: string;
        tracking_code: string;
        status: string;
        courier_provider: string;
      } | null;
    };

    if (existingShipment) {
      throw new Error(
        `Duplicate dispatch rejected: Sale ${params.saleId} already has an active parcel with ${existingShipment.courier_provider} (Tracking: ${existingShipment.tracking_code}, Status: ${existingShipment.status}).`
      );
    }

    // 2. Fetch sale details to confirm validity and invoice number
    const { data: saleData } = (await supabase
      .from("sales")
      .select("id, invoice_number, total_amount, paid_amount, due_amount")
      .eq("id", params.saleId)
      .eq("tenant_id", params.tenantId)
      .single()) as {
      data: {
        id: string;
        invoice_number: string;
        total_amount: number;
        paid_amount: number;
        due_amount: number;
      } | null;
    };

    if (!saleData) {
      throw new Error("Sale not found in store records");
    }

    // 3. Fetch encrypted courier credentials
    const { data: courierConfig } = (await supabase
      .from("tenant_courier_configs")
      .select("api_key_encrypted, secret_key_encrypted, webhook_secret_encrypted, is_active, metadata")
      .eq("tenant_id", params.tenantId)
      .eq("provider", params.courierName)
      .maybeSingle()) as {
      data: {
        api_key_encrypted: string;
        secret_key_encrypted: string | null;
        webhook_secret_encrypted: string | null;
        is_active: boolean;
        metadata: Record<string, unknown>;
      } | null;
    };

    let apiKey = "";
    let secretKey = "";
    if (courierConfig && courierConfig.api_key_encrypted) {
      try {
        apiKey = decryptCredential(courierConfig.api_key_encrypted);
        if (courierConfig.secret_key_encrypted) {
          secretKey = decryptCredential(courierConfig.secret_key_encrypted);
        }
      } catch (err) {
        console.warn("[CourierService] Failed to decrypt saved credentials, falling back to mock:", err);
      }
    }

    const provider = this.getProvider(courierProvider);
    const resolvedCod =
      codAmountBdt ||
      (saleData.due_amount ? Math.round(saleData.due_amount / 100) : 0);

    const parcelParams: CreateParcelParams = {
      saleId: params.saleId,
      invoiceNumber: saleData.invoice_number,
      recipientName: params.recipientName,
      recipientPhone: params.recipientPhone,
      recipientAddress: params.recipientAddress,
      codAmountBdt: resolvedCod,
      notes: params.notes,
    };

    // 4. Create parcel via provider
    const result = await provider.createParcel(parcelParams, {
      apiKey,
      secretKey,
      storeId: String((courierConfig?.metadata as Record<string, unknown>)?.store_id || ""),
    });

    if (!result.success) {
      return result;
    }

    // 5. Atomic database insertion under Unique Constraint
    const initialTimeline = [
      {
        status: result.status,
        timestamp: new Date().toISOString(),
        note: `Parcel booked with ${courierProvider.toUpperCase()} (Tracking: ${result.trackingCode})`,
      },
    ];

    const { error: insertError } = await (supabase.from("shipments") as any).insert({
      tenant_id: params.tenantId,
      sale_id: params.saleId,
      store_id: params.storeId || null,
      courier_provider: courierProvider,
      consignment_id: result.consignmentId,
      tracking_code: result.trackingCode,
      status: result.status,
      recipient_name: params.recipientName,
      recipient_phone: params.recipientPhone,
      recipient_address: params.recipientAddress,
      cod_amount_poisha: Math.round(codBdt * 100),
      delivery_fee_poisha: Math.round((result.deliveryFeeBdt || 0) * 100),
      timeline: initialTimeline,
      metadata: result.rawResponse || {},
    });

    if (insertError) {
      // If unique index constraint was violated by a concurrent request, guard trips!
      if (insertError.code === "23505" || insertError.message.includes("unique")) {
        throw new Error(
          `Duplicate dispatch rejected by database guard: Sale ${params.saleId} already has an active consignment.`
        );
      }
      throw new Error(`Failed to record shipment: ${insertError.message}`);
    }

    return result;
  }

  /**
   * Updates parcel status from a courier webhook event and appends to the timeline
   */
  static async handleStatusWebhook(params: {
    tenantId: string;
    courierName: CourierProviderName;
    consignmentId?: string;
    trackingCode?: string;
    newStatus: ShipmentStatus;
    note?: string;
  }): Promise<{ success: boolean; shipmentId?: string }> {
    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from("shipments")
      .select("id, status, timeline")
      .eq("tenant_id", params.tenantId)
      .eq("courier_provider", params.courierName);

    if (params.consignmentId) {
      query = query.eq("consignment_id", params.consignmentId);
    } else if (params.trackingCode) {
      query = query.eq("tracking_code", params.trackingCode);
    } else {
      throw new Error("Either consignmentId or trackingCode must be provided");
    }

    const { data: shipment } = (await query.maybeSingle()) as {
      data: {
        id: string;
        status: string;
        timeline: Array<{ status: string; timestamp: string; note: string }>;
      } | null;
    };

    if (!shipment) {
      return { success: false };
    }

    const updatedTimeline = [
      ...(shipment.timeline || []),
      {
        status: params.newStatus,
        timestamp: new Date().toISOString(),
        note: params.note || `Status updated to ${params.newStatus}`,
      },
    ];

    await (supabase.from("shipments") as any)
      .update({
        status: params.newStatus,
        timeline: updatedTimeline,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipment.id);

    return { success: true, shipmentId: shipment.id };
  }
}
