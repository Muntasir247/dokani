import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateWebhookSignature,
  verifyWebhookSignature,
  WebhookDispatcher,
} from "@/lib/webhooks/dispatcher";
import * as clientModule from "@/lib/supabase/client";

describe("Outgoing Webhooks & Cryptographic Signing", () => {
  const secret = "whsec_test_secret_key_1234567890abcdef";
  const payload = JSON.stringify({
    id: "evt_101",
    event: "sale.created",
    data: { invoice_number: "INV-2026-0001", total_amount: 1500.0 },
  });

  it("generates and verifies HMAC-SHA256 signature header correctly", () => {
    const header = generateWebhookSignature(payload, secret);
    expect(header).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);

    const verification = verifyWebhookSignature(payload, header, secret);
    expect(verification.valid).toBe(true);
  });

  it("rejects tampered payload", () => {
    const header = generateWebhookSignature(payload, secret);
    const tamperedPayload = payload.replace("INV-2026-0001", "INV-TAMPERED-9999");

    const verification = verifyWebhookSignature(tamperedPayload, header, secret);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toMatch(/mismatch/i);
  });

  it("rejects signatures outside the 300-second replay window", () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
    const oldHeader = generateWebhookSignature(payload, secret, oldTimestamp);

    const verification = verifyWebhookSignature(payload, oldHeader, secret, 300);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toMatch(/expired or outside tolerance/i);
  });

  it("rejects signatures generated with wrong secret", () => {
    const header = generateWebhookSignature(payload, "wrong_secret");
    const verification = verifyWebhookSignature(payload, header, secret);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toMatch(/mismatch/i);
  });

  describe("Webhook Dispatcher Delivery & Persistence", () => {
    it("delivers event and records audit entry into webhook_deliveries", async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "webhook_deliveries") {
            return { insert: mockInsert };
          }
          return {};
        }),
      };

      vi.spyOn(clientModule, "getServiceSupabase").mockReturnValue(mockSupabase as any);

      // Mock global fetch for webhook endpoint
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK"),
      });
      global.fetch = mockFetch;

      const dispatcher = new WebhookDispatcher();
      const result = await dispatcher.deliverToEndpoint(
        { id: "ep_01", url: "https://example.com/webhook", secret },
        {
          id: "evt_01",
          event: "sale.created",
          createdAt: new Date().toISOString(),
          tenantId: "tenant_01",
          data: { invoice: "INV-1" },
        },
        payload
      );

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/webhook",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Dokani-Event": "sale.created",
            "X-Dokani-Signature": expect.stringMatching(/^t=\d+,v1=/),
          }),
        })
      );
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });
  });
});
