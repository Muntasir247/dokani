/**
 * Courier Integration Interfaces & Types
 * Supports Bangladeshi courier networks: Steadfast and Pathao
 */

export type CourierProviderName = "steadfast" | "pathao" | "custom";

export type ShipmentStatus =
  | "in_review"
  | "pending"
  | "picked"
  | "in_transit"
  | "delivered"
  | "partial_delivered"
  | "cancelled"
  | "return"
  | "hold";

export interface ShipmentTimelineEvent {
  status: ShipmentStatus;
  timestamp: string;
  note: string;
}

export interface CreateParcelParams {
  saleId: string;
  invoiceNumber: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientCity?: string;
  recipientZone?: string;
  codAmountBdt: number;
  itemDescription?: string;
  notes?: string;
}

export interface CreateParcelResult {
  success: boolean;
  consignmentId: string;
  trackingCode: string;
  status: ShipmentStatus;
  deliveryFeeBdt?: number;
  rawResponse?: Record<string, unknown>;
  error?: string;
}

export interface ParcelTrackingResult {
  consignmentId: string;
  trackingCode: string;
  status: ShipmentStatus;
  timeline: ShipmentTimelineEvent[];
  updatedAt: string;
  rawResponse?: Record<string, unknown>;
}

export interface CourierCredentials {
  apiKey: string;
  secretKey?: string;
  webhookSecret?: string;
  storeId?: string; // Pathao store ID
}

export interface CourierProvider {
  readonly name: CourierProviderName;
  createParcel(params: CreateParcelParams, creds: CourierCredentials): Promise<CreateParcelResult>;
  trackParcel(trackingCode: string, creds: CourierCredentials): Promise<ParcelTrackingResult>;
  cancelParcel(consignmentId: string, creds: CourierCredentials): Promise<{ success: boolean; message?: string }>;
}
