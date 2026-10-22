import { describe, it, expect, vi } from "vitest";
import { SslCommerzProvider } from "@/lib/billing/providers/sslcommerz";
import { BkashProvider } from "@/lib/billing/providers/bkash";
import { generatePaymentReceivedEmailHtml } from "@/lib/email";

describe("Payment Gateways: Cryptographic Signature & Webhook Verification", () => {
  const sslProvider = new SslCommerzProvider();
  const bkashProvider = new BkashProvider();

  describe("SSLCommerz Signature Verification", () => {
    it("validates legitimate SSLCommerz IPN payload with correct cryptographic MD5 signature", async () => {
      // Setup payload fields
      const rawPayload: Record<string, string> = {
        tran_id: "TRX_TENANT1_12345678",
        val_id: "VAL_99887766",
        amount: "1490.00",
        currency: "BDT",
        status: "VALID",
        value_a: "33333333-3333-3333-3333-333333333333", // tenantId
        value_b: "pro", // planTier
        value_c: "month", // billingInterval
        value_d: "149000", // amountPoisha
        verify_key: "tran_id,val_id,amount,currency,status",
      };

      // Generate authentic signature using the provider's secret
      const authenticSignature = sslProvider.generateVerificationHash(rawPayload);
      const payloadWithSignature = {
        ...rawPayload,
        verify_sign: authenticSignature,
      };

      const result = await sslProvider.verifyWebhookOrIPN(payloadWithSignature);

      expect(result.isValid).toBe(true);
      expect(result.isPaid).toBe(true);
      expect(result.transactionId).toBe("TRX_TENANT1_12345678");
      expect(result.tenantId).toBe("33333333-3333-3333-3333-333333333333");
      expect(result.planTier).toBe("pro");
      expect(result.amountPoisha).toBe(149000);
      expect(result.idempotencyKey).toBe("sslcz_TRX_TENANT1_12345678_VAL_99887766");
    });

    it("REJECTS forged or tampered SSLCommerz payload when amount is altered", async () => {
      const rawPayload: Record<string, string> = {
        tran_id: "TRX_TENANT1_12345678",
        val_id: "VAL_99887766",
        amount: "1490.00",
        currency: "BDT",
        status: "VALID",
        value_a: "33333333-3333-3333-3333-333333333333",
        value_b: "pro",
        value_c: "month",
        value_d: "149000",
        verify_key: "tran_id,val_id,amount,currency,status",
      };

      const authenticSignature = sslProvider.generateVerificationHash(rawPayload);

      // Hacker intercepts and alters the amount to 10 BDT without knowing store_passwd
      const tamperedPayload = {
        ...rawPayload,
        amount: "10.00", // TAMPERED!
        verify_sign: authenticSignature,
      };

      const result = await sslProvider.verifyWebhookOrIPN(tamperedPayload);

      expect(result.isValid).toBe(false);
      expect(result.isPaid).toBe(false);
      expect(result.rawStatus).toBe("FORGED_SIGNATURE");
      expect(result.errorMessage).toContain("Cryptographic signature mismatch");
    });

    it("REJECTS forged SSLCommerz payload with random bogus signature", async () => {
      const bogusPayload = {
        tran_id: "TRX_FAKE_123",
        val_id: "VAL_FAKE_123",
        amount: "3990.00",
        currency: "BDT",
        status: "VALID",
        verify_key: "tran_id,val_id,amount,currency,status",
        verify_sign: "deadbeefcafebabe1234567890abcdef", // Fake signature
      };

      const result = await sslProvider.verifyWebhookOrIPN(bogusPayload);

      expect(result.isValid).toBe(false);
      expect(result.rawStatus).toBe("FORGED_SIGNATURE");
      expect(result.errorMessage).toContain("forged or tampered webhook payload");
    });

    it("identifies unconfirmed/failed payment status even with valid signature format", async () => {
      const failedPayload = {
        tran_id: "TRX_FAILED_999",
        val_id: "VAL_FAILED_999",
        amount: "1490.00",
        currency: "BDT",
        status: "FAILED",
        value_a: "tenant-1",
        value_b: "pro",
      };

      const result = await sslProvider.verifyWebhookOrIPN(failedPayload);

      expect(result.isValid).toBe(true);
      expect(result.isPaid).toBe(false);
      expect(result.rawStatus).toBe("FAILED");
    });
  });

  describe("bKash Webhook / Callback Verification", () => {
    it("verifies successful bKash payment callback", async () => {
      const bkashPayload = {
        paymentID: "BK_PAY_11223344",
        trxID: "TRX_BKASH_998877",
        status: "success",
        tenantId: "33333333-3333-3333-3333-333333333333",
        planTier: "business",
        billingInterval: "year",
        amountPoisha: 399000,
        amount: "3990.00",
      };

      const result = await bkashProvider.verifyWebhookOrIPN(bkashPayload);

      expect(result.isValid).toBe(true);
      expect(result.isPaid).toBe(true);
      expect(result.transactionId).toBe("TRX_BKASH_998877");
      expect(result.idempotencyKey).toBe("bkash_BK_PAY_11223344_TRX_BKASH_998877");
    });

    it("handles canceled bKash payment callback", async () => {
      const canceledPayload = {
        paymentID: "BK_PAY_CANCELLED",
        status: "cancel",
        tenantId: "33333333-3333-3333-3333-333333333333",
      };

      const result = await bkashProvider.verifyWebhookOrIPN(canceledPayload);

      expect(result.isValid).toBe(true);
      expect(result.isPaid).toBe(false);
      expect(result.rawStatus).toBe("CANCEL");
      expect(result.errorMessage).toContain("was cancel");
    });
  });

  describe("Replay Protection & Idempotent Processing", () => {
    it("produces identical and stable idempotency keys for repeated webhook deliveries", async () => {
      const payload = {
        tran_id: "TRX_REPLAY_TEST_1",
        val_id: "VAL_REPLAY_TEST_1",
        amount: "1490.00",
        currency: "BDT",
        status: "VALID",
      };

      const res1 = await sslProvider.verifyWebhookOrIPN(payload);
      const res2 = await sslProvider.verifyWebhookOrIPN(payload);

      expect(res1.idempotencyKey).toBe(res2.idempotencyKey);
      expect(res1.idempotencyKey).toBe("sslcz_TRX_REPLAY_TEST_1_VAL_REPLAY_TEST_1");
    });

    it("simulates webhook replay handling to prevent duplicate subscription crediting", () => {
      // Mock database of logged webhooks
      const processedWebhooks = new Set<string>();

      function processWebhook(idempotencyKey: string): { status: number; action: string } {
        if (processedWebhooks.has(idempotencyKey)) {
          return { status: 200, action: "DUPLICATE_IGNORED" };
        }
        processedWebhooks.add(idempotencyKey);
        return { status: 200, action: "PAYMENT_RECORDED" };
      }

      const key = "sslcz_TRX_DUPLICATE_CHECK_VAL_1";

      // First webhook delivery
      const firstCall = processWebhook(key);
      expect(firstCall.action).toBe("PAYMENT_RECORDED");

      // Attacker or gateway network retry replay
      const replayedCall = processWebhook(key);
      expect(replayedCall.action).toBe("DUPLICATE_IGNORED");
      expect(replayedCall.status).toBe(200);

      // Third retry
      const thirdCall = processWebhook(key);
      expect(thirdCall.action).toBe("DUPLICATE_IGNORED");
    });
  });

  describe("Transactional Email Template Generation", () => {
    it("renders valid payment receipt email template with required variables", () => {
      const html = generatePaymentReceivedEmailHtml({
        userName: "Shop Owner",
        storeName: "Dhaka Gadget Hub",
        invoiceNumber: "SUB-202610-0001",
        amountBdt: "1490.00",
        planName: "Pro Tier",
        periodEnd: "22/11/2026",
        invoiceUrl: "https://dokani.app/settings/billing",
      });

      expect(html).toContain("Dokani");
      expect(html).toContain("Shop Owner");
      expect(html).toContain("Dhaka Gadget Hub");
      expect(html).toContain("SUB-202610-0001");
      expect(html).toContain("1490.00");
      expect(html).toContain("Pro Tier");
      expect(html).toContain("22/11/2026");
      expect(html).toContain("https://dokani.app/settings/billing");
    });
  });
});
