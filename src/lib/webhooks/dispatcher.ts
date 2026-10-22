/**
 * Dokani Outgoing Webhook Dispatcher & HMAC-SHA256 Signer
 *
 * Dispatches events (`sale.created`, `stock.low`) to tenant-configured endpoints.
 * All outgoing payloads are cryptographically signed with HMAC-SHA256 to allow
 * subscribers to verify integrity and prevent replay attacks.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/client";
import { logger } from "@/lib/observability/logger";

export type WebhookEventType = "sale.created" | "stock.low";

export interface WebhookEvent<T = Record<string, unknown>> {
  id: string;
  event: WebhookEventType;
  createdAt: string;
  tenantId: string;
  data: T;
}

export interface WebhookDeliveryResult {
  endpointId: string;
  url: string;
  success: boolean;
  statusCode?: number;
  durationMs: number;
  error?: string;
  deliveryId: string;
}

/**
 * Generates an HMAC-SHA256 signature header:
 * Format: t=<timestamp>,v1=<hex_signature>
 */
export function generateWebhookSignature(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Validates an incoming webhook signature using constant-time comparison
 * and replay window protection (default 5 minutes).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300
): { valid: boolean; reason?: string } {
  if (!signatureHeader) {
    return { valid: false, reason: "Missing signature header" };
  }

  const parts = signatureHeader.split(",");
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const sigPart = parts.find((p) => p.startsWith("v1="));

  if (!timestampPart || !sigPart) {
    return { valid: false, reason: "Malformed signature header" };
  }

  const timestamp = parseInt(timestampPart.replace("t=", ""), 10);
  const signature = sigPart.replace("v1=", "");

  if (isNaN(timestamp)) {
    return { valid: false, reason: "Invalid timestamp" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return { valid: false, reason: "Signature timestamp expired or outside tolerance window" };
  }

  const expectedSignedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = createHmac("sha256", secret).update(expectedSignedPayload).digest("hex");

  try {
    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, reason: "Signature mismatch" };
    }
  } catch {
    return { valid: false, reason: "Signature buffer comparison failed" };
  }

  return { valid: true };
}

export class WebhookDispatcher {
  /**
   * Dispatches an event to all active endpoints subscribed to it for this tenant.
   */
  async dispatchEvent<T extends Record<string, unknown>>(
    tenantId: string,
    eventType: WebhookEventType,
    data: T
  ): Promise<WebhookDeliveryResult[]> {
    const supabase = getServiceSupabase();

    // Query active endpoints for this tenant subscribed to this event
    const { data: endpoints, error } = await supabase
      .from("tenant_webhook_endpoints")
      .select("id, url, secret, events, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    if (error || !endpoints || endpoints.length === 0) {
      return [];
    }

    const matchingEndpoints = (endpoints as Array<{ id: string; url: string; secret: string; events: unknown }>).filter((ep) => {
      const subscribedEvents = (ep.events as string[]) || [];
      return subscribedEvents.includes(eventType) || subscribedEvents.includes("*");
    });

    if (matchingEndpoints.length === 0) {
      return [];
    }

    const event: WebhookEvent<T> = {
      id: "evt_" + crypto.randomUUID().replace(/-/g, ""),
      event: eventType,
      createdAt: new Date().toISOString(),
      tenantId,
      data,
    };

    const payloadString = JSON.stringify(event);
    const results: WebhookDeliveryResult[] = [];

    for (const endpoint of matchingEndpoints) {
      const result = await this.deliverToEndpoint(endpoint, event, payloadString);
      results.push(result);
    }

    return results;
  }

  /**
   * Executes a single delivery attempt, records the result, and computes retry backoff on failure.
   */
  async deliverToEndpoint(
    endpoint: { id: string; url: string; secret: string },
    event: WebhookEvent,
    payloadString: string,
    attempt = 1
  ): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    const signature = generateWebhookSignature(payloadString, endpoint.secret);
    let statusCode = 0;
    let responseText = "";
    let isSuccess = false;
    let errorMessage: string | undefined;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Dokani-Webhooks/1.0",
          "X-Dokani-Event": event.event,
          "X-Dokani-Delivery": event.id,
          "X-Dokani-Signature": signature,
        },
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      statusCode = res.status;
      isSuccess = res.ok;
      responseText = await res.text().catch(() => "");
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
      statusCode = 504;
    }

    const durationMs = Date.now() - startTime;
    const nextRetryAt = isSuccess
      ? null
      : attempt < 3
        ? new Date(Date.now() + Math.pow(2, attempt) * 60 * 1000).toISOString()
        : null;

    // Record delivery attempt into database
    const supabase = getServiceSupabase();
    await supabase.from("webhook_deliveries").insert({
      tenant_id: event.tenantId,
      endpoint_id: endpoint.id,
      event: event.event,
      payload: event as any,
      status: isSuccess ? "delivered" : "failed",
      status_code: statusCode || null,
      last_error: responseText ? responseText.substring(0, 1000) : (errorMessage || null),
      attempts: attempt,
      max_attempts: 3,
      next_retry_at: nextRetryAt,
    });

    logger.info("Webhook delivery dispatched", {
      endpointId: endpoint.id,
      eventType: event.event,
      statusCode,
      success: isSuccess,
      durationMs,
    });

    return {
      endpointId: endpoint.id,
      url: endpoint.url,
      success: isSuccess,
      statusCode,
      durationMs,
      error: errorMessage,
      deliveryId: event.id,
    };
  }
}

export const webhookDispatcher = new WebhookDispatcher();
