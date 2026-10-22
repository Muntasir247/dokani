import { describe, it, expect, vi, beforeEach } from "vitest";
import { sanitizeBDPhone, sanitizeRecipientName, sanitizeDeliveryAddress } from "@/lib/courier/sanitization";
import { encryptCourierCredentials, decryptCourierCredentials } from "@/lib/courier/encryption";
import { SteadfastCourierAdapter } from "@/lib/courier/steadfast";
import { PathaoCourierAdapter } from "@/lib/courier/pathao";
import { CourierService } from "@/lib/courier/service";

describe("Courier Integration & Duplicate-Dispatch Guard", () => {
  describe("Payload & Bangladesh Phone Sanitization", () => {
    it("sanitizes various BD phone formats to standard 11 digits (01...)", () => {
      expect(sanitizeBDPhone("+8801712345678")).toBe("01712345678");
      expect(sanitizeBDPhone("8801812345678")).toBe("01812345678");
      expect(sanitizeBDPhone("01912-345678")).toBe("01912345678");
      expect(sanitizeBDPhone("016 12 34 56 78")).toBe("01612345678");
      expect(sanitizeBDPhone("01312345678")).toBe("01312345678");
    });

    it("sanitizes recipient name and address strips control characters", () => {
      expect(sanitizeRecipientName("  Rahim Uddin \n\t ")).toBe("Rahim Uddin");
      expect(sanitizeDeliveryAddress("House 12, Road 4, \n Dhanmondi, Dhaka.  ")).toBe(
        "House 12, Road 4, Dhanmondi, Dhaka."
      );
    });
  });

  describe("Credentials Encryption at Rest (AES-256-GCM)", () => {
    const originalKey = process.env.COURIER_ENCRYPTION_KEY;

    beforeEach(() => {
      process.env.COURIER_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"; // 32 bytes
    });

    it("encrypts and decrypts credentials securely with unique IV and auth tag", () => {
      const creds = { apiKey: "stf_live_998877", secretKey: "sec_abc123" };
      const encrypted = encryptCourierCredentials(creds);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.tag).toBeDefined();
      expect(encrypted.ciphertext).not.toContain("stf_live");

      const decrypted = decryptCourierCredentials(encrypted);
      expect(decrypted).toEqual(creds);
    });

    it("fails decryption if ciphertext or auth tag is tampered", () => {
      const creds = { apiKey: "stf_live_998877" };
      const encrypted = encryptCourierCredentials(creds);

      // Tamper auth tag
      const tampered = { ...encrypted, tag: Buffer.alloc(16, 0xff).toString("base64") };
      expect(() => decryptCourierCredentials(tampered)).toThrow();
    });
  });

  describe("Steadfast & Pathao Provider Adapters", () => {
    it("creates Steadfast parcel with sandbox simulation and returns consignment details", async () => {
      const adapter = new SteadfastCourierAdapter({
        apiKey: "test_key",
        secretKey: "test_secret",
      });

      const parcel = await adapter.createParcel({
        saleId: "sale_01",
        invoiceNumber: "INV-2026-101",
        recipientName: "Muntasir Rahman",
        recipientPhone: "+8801711122233",
        recipientAddress: "Dhanmondi, Dhaka",
        codAmountPoisha: 120000,
        itemDescription: "Grocery Items",
      });

      expect(parcel.consignmentId).toBeDefined();
      expect(parcel.trackingCode).toMatch(/^STF/);
      expect(parcel.status).toBe("in_transit");
    });

    it("maps Steadfast webhook status to standard status", () => {
      const adapter = new SteadfastCourierAdapter({ apiKey: "k", secretKey: "s" });
      const mappedDelivered = adapter.parseWebhookPayload({
        consignment_id: "STF_001",
        status: "delivered",
      });
      expect(mappedDelivered.status).toBe("delivered");

      const mappedReturn = adapter.parseWebhookPayload({
        consignment_id: "STF_001",
        status: "cancelled",
      });
      expect(mappedReturn.status).toBe("cancelled");
    });

    it("creates Pathao parcel with sandbox simulation", async () => {
      const adapter = new PathaoCourierAdapter({
        clientId: "pt_client",
        clientSecret: "pt_secret",
      });

      const parcel = await adapter.createParcel({
        saleId: "sale_02",
        invoiceNumber: "INV-2026-102",
        recipientName: "Kazi Nazrul",
        recipientPhone: "01822233344",
        recipientAddress: "Chittagong GPO",
        codAmountPoisha: 250000,
      });

      expect(parcel.consignmentId).toBeDefined();
      expect(parcel.trackingCode).toMatch(/^PTH/);
      expect(parcel.status).toBe("in_transit");
    });
  });

  describe("Acceptance Criterion: Duplicate-Dispatch Guard", () => {
    it("rejects dispatching the same sale twice to courier", async () => {
      // Mock Supabase client to simulate existing active shipment for sale_01
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "shipments") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    not: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          id: "shipment_existing",
                          consignment_id: "STF_EXISTING_99",
                          tracking_code: "STF_TRK_99",
                          courier_provider: "steadfast",
                          status: "in_transit",
                        },
                      }),
                    })),
                  })),
                })),
              })),
            };
          }
          return {};
        }),
      } as any;

      const service = new CourierService(mockSupabase);

      await expect(
        service.dispatchSaleParcel({
          tenantId: "tenant_01",
          saleId: "sale_01",
          courierProvider: "steadfast",
          recipientName: "Customer A",
          recipientPhone: "01711111111",
          recipientAddress: "Dhaka",
          codAmountPoisha: 50000,
          invoiceNumber: "INV-001",
        })
      ).rejects.toThrow(/Duplicate dispatch rejected/i);
    });
  });
});
