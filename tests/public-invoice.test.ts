import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getPublicInvoice } from "@/app/api/invoice/[shareToken]/route";
import { GET as getWarrantyLookup } from "@/app/api/warranty/lookup/route";

// Mock Supabase Server Client
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({}),
}));

// Mock callRpc
vi.mock("@/lib/supabase/rpc", () => ({
  callRpc: vi.fn().mockImplementation((_client, fnName, params) => {
    if (fnName === "fn_get_public_invoice") {
      if (params.p_share_token === "valid-share-token-32-chars-long") {
        return Promise.resolve({
          data: {
            found: true,
            sale: {
              id: "sale-1",
              invoiceNumber: "INV-001",
              soldAt: "2026-10-22T10:00:00Z",
              shareToken: "valid-share-token-32-chars-long",
              status: "completed",
              subtotal: 10000,
              discountAmount: 0,
              taxAmount: 0,
              totalAmount: 10000,
              paidAmount: 10000,
              dueAmount: 0,
              changeAmount: 0,
            },
            store: {
              id: "store-1",
              name: "Dokani Shop",
              code: "MAIN",
              vat_bin_number: "001234567-0101",
            },
            items: [
              {
                id: "item-1",
                name: "Smartphone Case",
                variantName: "Black",
                sku: "CASE-BLK",
                quantity: 1,
                unitPrice: 10000,
                discountAmount: 0,
                subtotal: 10000,
              },
            ],
            payments: [{ method: "cash", amount: 10000, reference: null }],
          },
          error: null,
        });
      }
      return Promise.resolve({
        data: { found: false, message: "Invoice not found" },
        error: null,
      });
    }

    if (fnName === "fn_lookup_warranty") {
      if (params.p_serial_number === "SN-ACTIVE-123") {
        return Promise.resolve({
          data: {
            found: true,
            serialNumber: "SN-ACTIVE-123",
            status: "sold",
            productName: "Mechanical Keyboard",
            sku: "KB-01",
            warrantyMonths: 12,
            warrantyStart: "2026-01-01",
            warrantyEnd: "2027-01-01",
            isWarrantyValid: true,
          },
          error: null,
        });
      }
      return Promise.resolve({
        data: { found: false, message: "Serial number not found" },
        error: null,
      });
    }

    return Promise.resolve({ data: null, error: { message: "Unknown RPC" } });
  }),
}));

describe("Public Invoices & Warranty Verification Security", () => {
  describe("GET /api/invoice/[shareToken]", () => {
    it("returns 400 for malformed or suspiciously short share tokens", async () => {
      const req = new NextRequest("http://localhost:3000/api/invoice/short");
      const res = await getPublicInvoice(req, {
        params: Promise.resolve({ shareToken: "short" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid share token");
    });

    it("returns 404 for non-existent or unguessable share tokens", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/invoice/random-invalid-token-12345678"
      );
      const res = await getPublicInvoice(req, {
        params: Promise.resolve({ shareToken: "random-invalid-token-12345678" }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain("Invoice not found or expired");
    });

    it("returns only sanitized public invoice data without leaking unit costs or margins", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/invoice/valid-share-token-32-chars-long"
      );
      const res = await getPublicInvoice(req, {
        params: Promise.resolve({ shareToken: "valid-share-token-32-chars-long" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.found).toBe(true);
      expect(json.sale.invoiceNumber).toBe("INV-001");
      expect(json.store.name).toBe("Dokani Shop");

      // Verify zero leak of sensitive business margins
      expect(json.items[0]).not.toHaveProperty("unit_cost");
      expect(json.items[0]).not.toHaveProperty("unitCost");
      expect(json.items[0]).not.toHaveProperty("profit");
      expect(json.sale).not.toHaveProperty("total_cost");
    });
  });

  describe("GET /api/warranty/lookup", () => {
    it("returns 400 if serial number parameter is missing or too short", async () => {
      const req = new NextRequest("http://localhost:3000/api/warranty/lookup?serial=a");
      const res = await getWarrantyLookup(req);
      expect(res.status).toBe(400);
    });

    it("returns warranty status for valid serial number", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/warranty/lookup?serial=SN-ACTIVE-123"
      );
      const res = await getWarrantyLookup(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.found).toBe(true);
      expect(json.productName).toBe("Mechanical Keyboard");
      expect(json.isWarrantyValid).toBe(true);
      expect(json.warrantyMonths).toBe(12);
    });

    it("returns found: false when serial is not in registry", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/warranty/lookup?serial=SN-NOT-EXIST"
      );
      const res = await getWarrantyLookup(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.found).toBe(false);
      expect(json.message).toContain("Serial number not found");
    });
  });
});
