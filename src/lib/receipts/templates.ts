/**
 * Dokani Receipt & A4 Invoice Template Engine
 *
 * Implements print-optimized HTML templates with @page CSS sizing
 * for both 80mm thermal receipts and A4 B2B tax invoices (Bangladesh Mushak standard).
 * Includes inline SVG QR codes for offline-safe browser printing.
 */

import QRCode from "qrcode";

export interface ReceiptItem {
  id: string;
  name: string;
  variantName?: string | null;
  sku: string;
  quantity: number;
  unitPricePoisha: number;
  discountPoisha: number;
  subtotalPoisha: number;
  serialNumbers?: string[];
  warrantyMonths?: number;
}

export interface ReceiptPayment {
  method: string;
  amountPoisha: number;
  reference?: string | null;
}

export interface ReceiptStore {
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  vatBinNumber?: string | null;
  logoUrl?: string | null;
  receiptFooter?: string | null;
  paymentTerms?: string | null;
  bankDetails?: string | null;
  currency?: string;
}

export interface ReceiptCustomer {
  id?: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  companyName?: string | null;
  taxId?: string | null;
  priceTier?: "retail" | "wholesale" | "custom";
  currentDuePoisha?: number;
  loyaltyPoints?: number;
}

export interface ReceiptViewModel {
  store: ReceiptStore;
  sale: {
    id: string;
    invoiceNumber: string;
    soldAt: string;
    cashierName?: string | null;
    shareToken?: string;
    publicUrl: string;
  };
  customer?: ReceiptCustomer | null;
  items: ReceiptItem[];
  totals: {
    subtotalPoisha: number;
    discountPoisha: number;
    taxPoisha: number;
    totalPoisha: number;
    paidPoisha: number;
    duePoisha: number;
    changePoisha: number;
    pointsEarned?: number;
    pointsRedeemed?: number;
  };
  payments: ReceiptPayment[];
}

/**
 * Formats poisha into standard BDT currency string (e.g. 150000 -> "৳1,500.00")
 */
export function formatPoisha(poisha: number, symbol: string = "৳"): string {
  const isNegative = poisha < 0;
  const abs = Math.abs(poisha);
  const taka = Math.floor(abs / 100);
  const remainder = abs % 100;
  const formattedTaka = taka.toLocaleString("en-US");
  const formattedRemainder = remainder.toString().padStart(2, "0");
  return `${isNegative ? "-" : ""}${symbol}${formattedTaka}.${formattedRemainder}`;
}

/**
 * Generates an inline SVG QR code string.
 */
export async function generateQrCodeSvg(text: string): Promise<string> {
  try {
    return await QRCode.toString(text, {
      type: "svg",
      margin: 1,
      width: 128,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });
  } catch {
    return `<div style="font-size:10px;text-align:center;">[QR Code]</div>`;
  }
}

/**
 * Generates a WhatsApp deep link to share the public invoice.
 */
export function getWhatsAppShareUrl(publicInvoiceUrl: string, invoiceNumber: string, storeName: string): string {
  const message = `Hello! Here is your invoice ${invoiceNumber} from ${storeName}: ${publicInvoiceUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Generates an SMS deep link for mobile invoice sharing.
 */
export function getSmsShareUrl(phone: string, publicInvoiceUrl: string, invoiceNumber: string): string {
  const message = `Invoice ${invoiceNumber}: ${publicInvoiceUrl}`;
  const cleanPhone = phone.replace(/[^0-9+]/g, "");
  return `sms:${cleanPhone}?body=${encodeURIComponent(message)}`;
}

/**
 * Generates 80mm Thermal Receipt HTML
 */
export async function generate80mmReceiptHtml(vm: ReceiptViewModel): Promise<string> {
  const qrSvg = await generateQrCodeSvg(vm.sale.publicUrl);
  const currencySymbol = vm.store.currency === "USD" ? "$" : "৳";

  const itemsHtml = vm.items
    .map((item, idx) => {
      const serialsHtml =
        item.serialNumbers && item.serialNumbers.length > 0
          ? `<div style="font-size: 8.5pt; color: #333; margin-top: 1px;">S/N: ${item.serialNumbers.join(", ")}</div>`
          : "";

      const discountNotice =
        item.discountPoisha > 0
          ? `<div style="font-size: 8pt; color: #555;">(Disc: -${formatPoisha(item.discountPoisha, currencySymbol)})</div>`
          : "";

      return `
        <tr>
          <td style="padding: 4px 0; vertical-align: top;">
            <div style="font-weight: 600; font-size: 9pt;">${idx + 1}. ${escapeHtml(item.name)}</div>
            ${item.variantName ? `<div style="font-size: 8.5pt; color: #444;">${escapeHtml(item.variantName)}</div>` : ""}
            ${serialsHtml}
            ${discountNotice}
          </td>
          <td style="text-align: center; vertical-align: top; padding: 4px 2px; font-size: 9pt; white-space: nowrap;">
            ${item.quantity}
          </td>
          <td style="text-align: right; vertical-align: top; padding: 4px 0; font-size: 9pt; font-family: monospace; white-space: nowrap;">
            ${formatPoisha(item.subtotalPoisha, currencySymbol)}
          </td>
        </tr>
      `;
    })
    .join("");

  const paymentsHtml = vm.payments
    .map(
      (p) => `
        <div style="display: flex; justify-content: space-between; font-size: 8.5pt; margin-bottom: 2px;">
          <span style="text-transform: capitalize;">${escapeHtml(p.method)}${p.reference ? ` (${escapeHtml(p.reference)})` : ""}:</span>
          <span style="font-family: monospace;">${formatPoisha(p.amountPoisha, currencySymbol)}</span>
        </div>
      `
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Receipt ${escapeHtml(vm.sale.invoiceNumber)}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    @media print {
      html, body {
        width: 80mm;
        margin: 0;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
      color: #000;
      background: #fff;
      font-size: 9pt;
      line-height: 1.25;
      padding: 10px 8px;
      margin: 0 auto;
      max-width: 76mm;
      box-sizing: border-box;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .double-divider {
      border-top: 2px solid #000;
      margin: 6px 0;
    }
    .flex-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    .qr-container svg {
      width: 90px;
      height: 90px;
      margin: 0 auto;
      display: block;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="text-align: center; margin-bottom: 6px;">
    ${vm.store.logoUrl ? `<img src="${escapeHtml(vm.store.logoUrl)}" alt="Logo" style="max-height: 40px; margin-bottom: 4px;" />` : ""}
    <div style="font-size: 13pt; font-weight: bold; text-transform: uppercase;">${escapeHtml(vm.store.name)}</div>
    ${vm.store.address ? `<div style="font-size: 8.5pt; color: #222;">${escapeHtml(vm.store.address)}</div>` : ""}
    ${vm.store.phone ? `<div style="font-size: 8.5pt;">Tel: ${escapeHtml(vm.store.phone)}</div>` : ""}
    ${vm.store.vatBinNumber ? `<div style="font-size: 8.5pt; font-weight: bold;">Mushak BIN: ${escapeHtml(vm.store.vatBinNumber)}</div>` : ""}
  </div>

  <div class="divider"></div>

  <!-- Invoice Meta -->
  <div class="flex-row">
    <span>Invoice: <strong>${escapeHtml(vm.sale.invoiceNumber)}</strong></span>
    <span>${new Date(vm.sale.soldAt).toLocaleDateString("en-GB")}</span>
  </div>
  <div class="flex-row" style="font-size: 8pt; color: #444;">
    <span>Time: ${new Date(vm.sale.soldAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
    ${vm.sale.cashierName ? `<span>Cashier: ${escapeHtml(vm.sale.cashierName)}</span>` : ""}
  </div>

  <!-- Customer Details if attached -->
  ${
    vm.customer
      ? `
    <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dotted #888;">
      <div style="font-weight: 600;">Customer: ${escapeHtml(vm.customer.name)}</div>
      ${vm.customer.phone ? `<div>Phone: ${escapeHtml(vm.customer.phone)}</div>` : ""}
      ${vm.customer.taxId ? `<div>Tax/BIN: ${escapeHtml(vm.customer.taxId)}</div>` : ""}
    </div>
  `
      : ""
  }

  <div class="divider"></div>

  <!-- Items Table -->
  <table style="width: 100%; border-collapse: collapse; margin: 4px 0;">
    <thead>
      <tr style="border-bottom: 1px solid #000; font-size: 8pt; text-transform: uppercase;">
        <th style="text-align: left; padding-bottom: 3px;">Item</th>
        <th style="text-align: center; padding-bottom: 3px; width: 30px;">Qty</th>
        <th style="text-align: right; padding-bottom: 3px; width: 65px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="divider"></div>

  <!-- Financial Totals -->
  <div class="flex-row">
    <span>Subtotal:</span>
    <span style="font-family: monospace;">${formatPoisha(vm.totals.subtotalPoisha, currencySymbol)}</span>
  </div>

  ${
    vm.totals.discountPoisha > 0
      ? `
    <div class="flex-row" style="color: #000;">
      <span>Discount:</span>
      <span style="font-family: monospace;">-${formatPoisha(vm.totals.discountPoisha, currencySymbol)}</span>
    </div>
  `
      : ""
  }

  ${
    vm.totals.taxPoisha > 0
      ? `
    <div class="flex-row">
      <span>VAT / Tax:</span>
      <span style="font-family: monospace;">+${formatPoisha(vm.totals.taxPoisha, currencySymbol)}</span>
    </div>
  `
      : ""
  }

  <div class="double-divider"></div>

  <div class="flex-row" style="font-size: 11pt; font-weight: bold;">
    <span>NET PAYABLE:</span>
    <span style="font-family: monospace;">${formatPoisha(vm.totals.totalPoisha, currencySymbol)}</span>
  </div>

  <div class="divider"></div>

  <!-- Payments & Due -->
  ${paymentsHtml}

  <div class="flex-row" style="font-weight: bold; margin-top: 3px;">
    <span>Paid Amount:</span>
    <span style="font-family: monospace;">${formatPoisha(vm.totals.paidPoisha, currencySymbol)}</span>
  </div>

  ${
    vm.totals.changePoisha > 0
      ? `
    <div class="flex-row" style="font-weight: bold;">
      <span>Change Return:</span>
      <span style="font-family: monospace;">${formatPoisha(vm.totals.changePoisha, currencySymbol)}</span>
    </div>
  `
      : ""
  }

  ${
    vm.totals.duePoisha > 0
      ? `
    <div class="flex-row" style="font-weight: bold; color: #000; border-top: 1px dotted #000; padding-top: 2px; margin-top: 2px;">
      <span>CURRENT DUE:</span>
      <span style="font-family: monospace;">${formatPoisha(vm.totals.duePoisha, currencySymbol)}</span>
    </div>
  `
      : ""
  }

  <!-- Loyalty Summary if active -->
  ${
    (vm.totals.pointsEarned && vm.totals.pointsEarned > 0) || (vm.totals.pointsRedeemed && vm.totals.pointsRedeemed > 0)
      ? `
    <div style="margin-top: 6px; padding: 4px; background: #f4f4f4; border-radius: 4px; font-size: 8pt;">
      ${vm.totals.pointsRedeemed ? `<div>Points Redeemed: ${vm.totals.pointsRedeemed}</div>` : ""}
      ${vm.totals.pointsEarned ? `<div>Points Earned Today: +${vm.totals.pointsEarned}</div>` : ""}
      ${vm.customer?.loyaltyPoints !== undefined ? `<div>New Loyalty Balance: ${vm.customer.loyaltyPoints} pts</div>` : ""}
    </div>
  `
      : ""
  }

  <!-- QR Code & Verification -->
  <div class="divider"></div>
  <div style="text-align: center; margin: 6px 0;">
    <div class="qr-container">${qrSvg}</div>
    <div style="font-size: 7.5pt; color: #444; margin-top: 2px;">Scan to view digital invoice</div>
  </div>

  <!-- Footer Notice -->
  <div style="text-align: center; font-size: 8pt; margin-top: 6px;">
    ${vm.store.receiptFooter ? `<div>${escapeHtml(vm.store.receiptFooter)}</div>` : "<div>Thank you for shopping with us!</div>"}
    <div style="font-size: 7pt; color: #777; margin-top: 4px;">Powered by Dokani POS</div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generates A4 B2B Tax Invoice HTML (Bangladesh Mushak 6.3 Standard Compatible)
 */
export async function generateA4InvoiceHtml(vm: ReceiptViewModel): Promise<string> {
  const qrSvg = await generateQrCodeSvg(vm.sale.publicUrl);
  const currencySymbol = vm.store.currency === "USD" ? "$" : "৳";

  const rowsHtml = vm.items
    .map((item, idx) => {
      const serialsText =
        item.serialNumbers && item.serialNumbers.length > 0
          ? `<div style="font-size: 8pt; color: #555; margin-top: 2px;">Serials / IMEI: ${item.serialNumbers.join(", ")}</div>`
          : "";

      const warrantyText =
        item.warrantyMonths && item.warrantyMonths > 0
          ? `<span style="display: inline-block; font-size: 7.5pt; background: #e0f2fe; color: #0369a1; padding: 1px 5px; border-radius: 3px; margin-top: 2px;">${item.warrantyMonths} Mo. Warranty</span>`
          : "";

      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 8px; text-align: center; vertical-align: top; color: #6b7280;">${idx + 1}</td>
          <td style="padding: 10px 8px; vertical-align: top;">
            <div style="font-weight: 600; color: #111827;">${escapeHtml(item.name)}</div>
            ${item.variantName ? `<div style="font-size: 8.5pt; color: #4b5563;">Variant: ${escapeHtml(item.variantName)}</div>` : ""}
            <div style="font-size: 8pt; color: #9ca3af;">SKU: ${escapeHtml(item.sku)}</div>
            ${serialsText}
            ${warrantyText}
          </td>
          <td style="padding: 10px 8px; text-align: center; vertical-align: top; font-weight: 500;">${item.quantity}</td>
          <td style="padding: 10px 8px; text-align: right; vertical-align: top; font-family: monospace;">${formatPoisha(item.unitPricePoisha, currencySymbol)}</td>
          <td style="padding: 10px 8px; text-align: right; vertical-align: top; font-family: monospace; color: #dc2626;">
            ${item.discountPoisha > 0 ? `-${formatPoisha(item.discountPoisha, currencySymbol)}` : "—"}
          </td>
          <td style="padding: 10px 8px; text-align: right; vertical-align: top; font-family: monospace; font-weight: 600;">
            ${formatPoisha(item.subtotalPoisha, currencySymbol)}
          </td>
        </tr>
      `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Invoice ${escapeHtml(vm.sale.invoiceNumber)} - ${escapeHtml(vm.store.name)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm;
    }
    @media print {
      body {
        margin: 0;
        padding: 0;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print {
        display: none !important;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937;
      background: #fff;
      font-size: 9.5pt;
      line-height: 1.4;
      margin: 0 auto;
      max-width: 210mm;
      padding: 15px;
      box-sizing: border-box;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    .header-box {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 18px;
      margin-bottom: 20px;
    }
    .meta-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 16px;
    }
    .qr-box svg {
      width: 96px;
      height: 96px;
      display: block;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header-box">
    <div>
      ${vm.store.logoUrl ? `<img src="${escapeHtml(vm.store.logoUrl)}" alt="Logo" style="max-height: 48px; margin-bottom: 6px;" />` : ""}
      <h1 style="margin: 0 0 4px 0; font-size: 20pt; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">
        ${escapeHtml(vm.store.name)}
      </h1>
      ${vm.store.address ? `<div style="color: #475569; font-size: 9pt;">${escapeHtml(vm.store.address)}</div>` : ""}
      ${vm.store.phone ? `<div style="color: #475569; font-size: 9pt;">Phone: ${escapeHtml(vm.store.phone)}</div>` : ""}
      ${
        vm.store.vatBinNumber
          ? `<div style="display: inline-block; margin-top: 4px; font-weight: 700; color: #0284c7; font-size: 9.5pt; background: #e0f2fe; padding: 2px 8px; border-radius: 4px;">
              Mushak / VAT BIN: ${escapeHtml(vm.store.vatBinNumber)}
            </div>`
          : ""
      }
    </div>

    <div style="text-align: right;">
      <div style="font-size: 22pt; font-weight: 900; color: #0284c7; letter-spacing: 1px; text-transform: uppercase;">
        TAX INVOICE
      </div>
      <div style="font-size: 11pt; font-weight: 700; margin-top: 4px; color: #1e293b;">
        # ${escapeHtml(vm.sale.invoiceNumber)}
      </div>
      <div style="font-size: 9pt; color: #64748b; margin-top: 2px;">
        Date: ${new Date(vm.sale.soldAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </div>
      ${
        vm.store.paymentTerms
          ? `<div style="font-size: 8.5pt; color: #64748b; margin-top: 2px;">Payment Terms: ${escapeHtml(vm.store.paymentTerms)}</div>`
          : ""
      }
    </div>
  </div>

  <!-- Bill To & Overview Grid -->
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
    <!-- Customer / Bill To -->
    <div class="meta-card">
      <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 6px; letter-spacing: 0.5px;">
        Bill To (Client / Buyer)
      </div>
      ${
        vm.customer
          ? `
        <div style="font-size: 11pt; font-weight: 700; color: #0f172a;">${escapeHtml(vm.customer.name)}</div>
        ${vm.customer.companyName ? `<div style="font-weight: 600; color: #334155;">${escapeHtml(vm.customer.companyName)}</div>` : ""}
        ${vm.customer.address ? `<div style="color: #475569; font-size: 9pt;">${escapeHtml(vm.customer.address)}</div>` : ""}
        ${vm.customer.phone ? `<div style="color: #475569; font-size: 9pt;">Phone: ${escapeHtml(vm.customer.phone)}</div>` : ""}
        ${
          vm.customer.taxId
            ? `<div style="font-size: 8.5pt; color: #0369a1; font-weight: 600; margin-top: 4px;">Buyer BIN/TIN: ${escapeHtml(vm.customer.taxId)}</div>`
            : ""
        }
        ${
          vm.customer.priceTier && vm.customer.priceTier !== "retail"
            ? `<span style="display: inline-block; font-size: 7.5pt; text-transform: uppercase; background: #fef3c7; color: #b45309; padding: 1px 6px; border-radius: 4px; margin-top: 4px; font-weight: 700;">${vm.customer.priceTier} Tier</span>`
            : ""
        }
      `
          : `<div style="color: #64748b; font-style: italic;">Walk-in Customer</div>`
      }
    </div>

    <!-- Payment Status Summary -->
    <div class="meta-card" style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">
          Payment Status
        </div>
        <div style="font-size: 16pt; font-weight: 800; color: ${vm.totals.duePoisha > 0 ? "#b91c1c" : "#15803d"};">
          ${vm.totals.duePoisha > 0 ? "PARTIAL / DUE" : "PAID IN FULL"}
        </div>
        <div style="font-size: 9pt; color: #475569; margin-top: 4px;">
          Amount Tendered: <strong>${formatPoisha(vm.totals.paidPoisha, currencySymbol)}</strong>
        </div>
        ${
          vm.totals.duePoisha > 0
            ? `<div style="font-size: 9pt; color: #b91c1c; font-weight: 700;">
                Balance Due: ${formatPoisha(vm.totals.duePoisha, currencySymbol)}
              </div>`
            : ""
        }
      </div>

      <div class="qr-box" style="text-align: center;">
        ${qrSvg}
        <div style="font-size: 7pt; color: #64748b; margin-top: 2px;">Verify Invoice</div>
      </div>
    </div>
  </div>

  <!-- Items Table -->
  <table style="margin-bottom: 24px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
    <thead>
      <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-size: 8.5pt; font-weight: 700; color: #334155; text-transform: uppercase;">
        <th style="padding: 10px 8px; width: 35px; text-align: center;">#</th>
        <th style="padding: 10px 8px; text-align: left;">Item Description</th>
        <th style="padding: 10px 8px; width: 60px; text-align: center;">Qty</th>
        <th style="padding: 10px 8px; width: 110px; text-align: right;">Unit Price</th>
        <th style="padding: 10px 8px; width: 95px; text-align: right;">Discount</th>
        <th style="padding: 10px 8px; width: 120px; text-align: right;">Net Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <!-- Lower Section: Terms/Bank info on Left, Totals on Right -->
  <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 30px; margin-bottom: 30px;">
    <!-- Payment & Terms -->
    <div>
      ${
        vm.store.bankDetails
          ? `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: #475569; margin-bottom: 4px;">
            Bank Transfer / Wire Details
          </div>
          <div style="font-size: 8.5pt; color: #334155; white-space: pre-line;">${escapeHtml(vm.store.bankDetails)}</div>
        </div>
      `
          : ""
      }

      ${
        vm.payments.length > 0
          ? `
        <div style="margin-bottom: 12px;">
          <div style="font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">
            Payment Tender Breakdown
          </div>
          ${vm.payments
            .map(
              (p) => `
            <div style="display: flex; justify-content: space-between; font-size: 8.5pt; padding: 3px 0; border-bottom: 1px dotted #e2e8f0;">
              <span style="text-transform: capitalize;">${escapeHtml(p.method)}${p.reference ? ` (Ref: ${escapeHtml(p.reference)})` : ""}</span>
              <span style="font-family: monospace; font-weight: 600;">${formatPoisha(p.amountPoisha, currencySymbol)}</span>
            </div>
          `
            )
            .join("")}
        </div>
      `
          : ""
      }

      <div style="font-size: 8pt; color: #64748b; line-height: 1.4;">
        ${vm.store.receiptFooter ? `<div>${escapeHtml(vm.store.receiptFooter)}</div>` : ""}
        <div>Note: Goods once sold may be returned or replaced subject to warranty terms and conditions.</div>
      </div>
    </div>

    <!-- Summary Box -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
      <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 9pt;">
        <span style="color: #64748b;">Subtotal:</span>
        <span style="font-family: monospace; font-weight: 600;">${formatPoisha(vm.totals.subtotalPoisha, currencySymbol)}</span>
      </div>

      ${
        vm.totals.discountPoisha > 0
          ? `
        <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 9pt; color: #dc2626;">
          <span>Invoice Discount:</span>
          <span style="font-family: monospace; font-weight: 600;">-${formatPoisha(vm.totals.discountPoisha, currencySymbol)}</span>
        </div>
      `
          : ""
      }

      ${
        vm.totals.taxPoisha > 0
          ? `
        <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 9pt;">
          <span style="color: #64748b;">Applicable VAT / Tax:</span>
          <span style="font-family: monospace; font-weight: 600;">+${formatPoisha(vm.totals.taxPoisha, currencySymbol)}</span>
        </div>
      `
          : ""
      }

      <div style="border-top: 2px solid #cbd5e1; margin: 8px 0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 13pt; font-weight: 800; color: #0f172a;">
        <span>Total Payable:</span>
        <span style="font-family: monospace; color: #0284c7;">${formatPoisha(vm.totals.totalPoisha, currencySymbol)}</span>
      </div>

      <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 9pt;">
        <span style="color: #64748b;">Amount Received:</span>
        <span style="font-family: monospace; font-weight: 600;">${formatPoisha(vm.totals.paidPoisha, currencySymbol)}</span>
      </div>

      ${
        vm.totals.changePoisha > 0
          ? `
        <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 9pt;">
          <span style="color: #64748b;">Change Returned:</span>
          <span style="font-family: monospace; font-weight: 600;">${formatPoisha(vm.totals.changePoisha, currencySymbol)}</span>
        </div>
      `
          : ""
      }

      <div style="border-top: 1px solid #cbd5e1; margin-top: 6px; padding-top: 6px; display: flex; justify-content: space-between; font-size: 10.5pt; font-weight: 700;">
        <span style="color: ${vm.totals.duePoisha > 0 ? "#b91c1c" : "#15803d"};">Current Due:</span>
        <span style="font-family: monospace; color: ${vm.totals.duePoisha > 0 ? "#b91c1c" : "#15803d"};">
          ${formatPoisha(vm.totals.duePoisha, currencySymbol)}
        </span>
      </div>
    </div>
  </div>

  <!-- Signatures Footer -->
  <div style="margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; padding-top: 20px;">
    <div style="text-align: center; width: 200px;">
      <div style="border-top: 1px dashed #94a3b8; padding-top: 6px; font-size: 8.5pt; color: #64748b;">
        Customer / Receiver Signature
      </div>
    </div>
    <div style="text-align: center; width: 200px;">
      <div style="border-top: 1px solid #0f172a; padding-top: 6px; font-size: 8.5pt; font-weight: 700; color: #0f172a;">
        Authorized Store Signatory
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Escapes HTML characters to prevent XSS in printed templates.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
