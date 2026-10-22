import { describe, it, expect } from "vitest";
import {
  generate80mmReceiptHtml,
  generateA4InvoiceHtml,
  formatPoisha,
  getWhatsAppShareUrl,
  getSmsShareUrl,
  ReceiptViewModel,
} from "@/lib/receipts/templates";
import { buildEscPosReceipt } from "@/lib/receipts/escpos";

describe("Receipt and Invoice Templates Engine", () => {
  const mockViewModel: ReceiptViewModel = {
    store: {
      name: "Dokani Tech & Gadgets",
      code: "MAIN",
      address: "Shop 12, Level 4, Multiplan Center, Dhaka",
      phone: "+880 1711 000000",
      vatBinNumber: "001928374-0101",
      logoUrl: "https://example.com/logo.png",
      receiptFooter: "Thank you for shopping with us! No return after 7 days.",
      paymentTerms: "Net 30 days. Cheques payable to Dokani Store Ltd.",
      bankDetails: "Bank: City Bank, A/C: 1102938475, Routing: 08526112",
      currency: "BDT",
    },
    sale: {
      id: "sale-uuid-1234",
      invoiceNumber: "INV-2026-0042",
      soldAt: "2026-10-22T14:30:00Z",
      cashierName: "Rahim Cashier",
      shareToken: "a1b2c3d4e5f6789012345678abcdef01",
      publicUrl: "https://dokani.app/invoice/a1b2c3d4e5f6789012345678abcdef01",
    },
    customer: {
      id: "cust-uuid-5678",
      name: "Tanvir Ahmed",
      phone: "01819999999",
      address: "Dhanmondi, Dhaka",
      companyName: "Nexus IT Solutions",
      taxId: "BIN-99887766",
      priceTier: "wholesale",
      currentDuePoisha: 50000,
      loyaltyPoints: 120,
    },
    items: [
      {
        id: "item-1",
        name: "Logitech MX Master 3S Mouse",
        variantName: "Graphite",
        sku: "LOGI-MX3S-GR",
        quantity: 2,
        unitPricePoisha: 1250000, // ৳12,500.00
        discountPoisha: 50000, // ৳500.00 discount
        subtotalPoisha: 2450000, // ৳24,500.00
        serialNumbers: ["SN-MX3S-001", "SN-MX3S-002"],
        warrantyMonths: 12,
      },
      {
        id: "item-2",
        name: "Mechanical Keyboard Wrist Rest",
        variantName: null,
        sku: "ACC-WRIST-01",
        quantity: 1,
        unitPricePoisha: 150000, // ৳1,500.00
        discountPoisha: 0,
        subtotalPoisha: 150000,
      },
    ],
    totals: {
      subtotalPoisha: 2650000, // ৳26,500.00
      discountPoisha: 50000, // ৳500.00
      taxPoisha: 130000, // ৳1,300.00 (5% VAT)
      totalPoisha: 2730000, // ৳27,300.00
      paidPoisha: 2000000, // ৳20,000.00 tendered
      duePoisha: 730000, // ৳7,300.00 due
      changePoisha: 0,
      pointsEarned: 20,
      pointsRedeemed: 0,
    },
    payments: [
      { method: "cash", amountPoisha: 1000000, reference: null },
      { method: "bkash", amountPoisha: 1000000, reference: "Trx-BK998822" },
    ],
  };

  describe("formatPoisha", () => {
    it("formats poisha into standard BDT currency representation", () => {
      expect(formatPoisha(10000)).toBe("৳100.00");
      expect(formatPoisha(1250000)).toBe("৳12,500.00");
      expect(formatPoisha(50)).toBe("৳0.50");
      expect(formatPoisha(0)).toBe("৳0.00");
      expect(formatPoisha(-5000)).toBe("-৳50.00");
    });
  });

  describe("80mm Thermal Receipt Generation", () => {
    it("generates valid 80mm print-optimized HTML containing critical business fields", async () => {
      const html = await generate80mmReceiptHtml(mockViewModel);

      // Verify print layout and @page CSS sizing
      expect(html).toContain("@page");
      expect(html).toContain("size: 80mm auto");
      expect(html).toContain("max-width: 76mm");

      // Verify store header
      expect(html).toContain("Dokani Tech &amp; Gadgets");
      expect(html).toContain("Mushak BIN: 001928374-0101");
      expect(html).toContain("Tel: +880 1711 000000");

      // Verify invoice metadata
      expect(html).toContain("INV-2026-0042");
      expect(html).toContain("Cashier: Rahim Cashier");

      // Verify items and serial numbers
      expect(html).toContain("Logitech MX Master 3S Mouse");
      expect(html).toContain("SN-MX3S-001, SN-MX3S-002");

      // Verify financial breakdown & split tender
      expect(html).toContain("NET PAYABLE:");
      expect(html).toContain("৳27,300.00");
      expect(html).toContain("CURRENT DUE:");
      expect(html).toContain("৳7,300.00");
      expect(html).toContain("bkash (Trx-BK998822):");

      // Verify pure SVG QR code is embedded inline
      expect(html).toContain("<svg");
      expect(html).toContain("Scan to view digital invoice");

      // Verify custom footer
      expect(html).toContain("Thank you for shopping with us! No return after 7 days.");
    });
  });

  describe("A4 B2B Tax Invoice Generation", () => {
    it("generates valid A4 Mushak-compliant B2B invoice HTML", async () => {
      const html = await generateA4InvoiceHtml(mockViewModel);

      // Verify print layout and A4 sizing
      expect(html).toContain("@page");
      expect(html).toContain("size: A4 portrait");

      // Verify store header & tax registration
      expect(html).toContain("TAX INVOICE");
      expect(html).toContain("Mushak / VAT BIN: 001928374-0101");

      // Verify B2B Buyer details
      expect(html).toContain("Bill To (Client / Buyer)");
      expect(html).toContain("Tanvir Ahmed");
      expect(html).toContain("Nexus IT Solutions");
      expect(html).toContain("Buyer BIN/TIN: BIN-99887766");
      expect(html).toContain("wholesale Tier");

      // Verify item warranty badge
      expect(html).toContain("12 Mo. Warranty");

      // Verify payment terms & bank details
      expect(html).toContain("Payment Terms: Net 30 days. Cheques payable to Dokani Store Ltd.");
      expect(html).toContain("Bank: City Bank, A/C: 1102938475, Routing: 08526112");

      // Verify verification QR code & signatures
      expect(html).toContain("<svg");
      expect(html).toContain("Customer / Receiver Signature");
      expect(html).toContain("Authorized Store Signatory");
    });
  });

  describe("ESC/POS Binary Command Encoder", () => {
    it("compiles receipt into valid ESC/POS byte sequence", () => {
      const bytes = buildEscPosReceipt(mockViewModel);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(100);

      // Initialized with ESC @ (0x1B, 0x40)
      expect(bytes[0]).toBe(0x1b);
      expect(bytes[1]).toBe(0x40);

      // Cut paper command present (GS V: 0x1D, 0x56)
      const hasCutCommand = bytes.some((b, i) => b === 0x1d && bytes[i + 1] === 0x56);
      expect(hasCutCommand).toBe(true);
    });
  });

  describe("WhatsApp and SMS Sharing Deep Links", () => {
    it("generates proper wa.me share link with public invoice URL", () => {
      const waUrl = getWhatsAppShareUrl(
        mockViewModel.sale.publicUrl,
        mockViewModel.sale.invoiceNumber,
        mockViewModel.store.name
      );

      expect(waUrl).toContain("https://wa.me/?text=");
      expect(decodeURIComponent(waUrl)).toContain("INV-2026-0042");
      expect(decodeURIComponent(waUrl)).toContain(mockViewModel.sale.publicUrl);
    });

    it("generates proper sms: share link", () => {
      const smsUrl = getSmsShareUrl(
        "01819999999",
        mockViewModel.sale.publicUrl,
        mockViewModel.sale.invoiceNumber
      );

      expect(smsUrl).toContain("sms:01819999999?body=");
      expect(decodeURIComponent(smsUrl)).toContain("INV-2026-0042");
    });
  });
});
