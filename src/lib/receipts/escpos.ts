/**
 * ESC/POS Binary Command Generator for Direct Thermal Receipt Printers
 *
 * Implements standard ESC/POS protocol encoding suitable for WebUSB, WebSerial,
 * or raw Bluetooth/TCP/IP socket communication with thermal receipt printers (Epson, Xprinter, Rongta, etc.).
 */

import { ReceiptViewModel, formatPoisha } from "./templates";

export const ESC = 0x1b;
export const GS = 0x1d;

export class EscPosBuilder {
  private buffer: number[] = [];
  private readonly columns: number;

  constructor(columns: number = 42) {
    this.columns = columns;
    this.init();
  }

  init(): this {
    this.buffer.push(ESC, 0x40); // ESC @ : Initialize printer
    return this;
  }

  alignLeft(): this {
    this.buffer.push(ESC, 0x61, 0); // ESC a 0
    return this;
  }

  alignCenter(): this {
    this.buffer.push(ESC, 0x61, 1); // ESC a 1
    return this;
  }

  alignRight(): this {
    this.buffer.push(ESC, 0x61, 2); // ESC a 2
    return this;
  }

  bold(enable: boolean = true): this {
    this.buffer.push(ESC, 0x45, enable ? 1 : 0); // ESC E n
    return this;
  }

  doubleSize(enable: boolean = true): this {
    this.buffer.push(GS, 0x21, enable ? 0x11 : 0x00); // GS ! n
    return this;
  }

  lineFeed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  text(str: string): this {
    // Basic ASCII / CP437 mapping for raw thermal output
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      this.buffer.push(code < 128 ? code : 0x3f); // replace non-ASCII with '?' if no codepage loaded
    }
    return this;
  }

  textLine(str: string): this {
    this.text(str);
    this.lineFeed(1);
    return this;
  }

  divider(char: string = "-"): this {
    this.textLine(char.repeat(this.columns));
    return this;
  }

  twoColumnRow(left: string, right: string): this {
    const leftLength = left.length;
    const rightLength = right.length;
    const spacesNeeded = Math.max(1, this.columns - (leftLength + rightLength));
    this.textLine(left + " ".repeat(spacesNeeded) + right);
    return this;
  }

  threeColumnRow(left: string, center: string, right: string, centerWidth: number = 6): this {
    const rightWidth = 10;
    const leftWidth = this.columns - centerWidth - rightWidth;

    const truncatedLeft = left.slice(0, leftWidth).padEnd(leftWidth);
    const paddedCenter = center.padStart(centerWidth);
    const paddedRight = right.padStart(rightWidth);

    this.textLine(truncatedLeft + paddedCenter + paddedRight);
    return this;
  }

  /**
   * GS ( k <pL> <pH> cn fn m ... (standard ESC/POS QR code command)
   */
  qrCode(url: string): this {
    const textBytes = Array.from(new TextEncoder().encode(url));
    const len = textBytes.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);

    this.alignCenter();
    // 1. Model: Model 2
    this.buffer.push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0);
    // 2. Module size (4 dots)
    this.buffer.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 4);
    // 3. Error correction level (M = 49)
    this.buffer.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 49);
    // 4. Store data
    this.buffer.push(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...textBytes);
    // 5. Print QR code
    this.buffer.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30);
    this.lineFeed(1);
    this.alignLeft();
    return this;
  }

  cut(partial: boolean = true): this {
    this.lineFeed(3);
    this.buffer.push(GS, 0x56, partial ? 1 : 0); // GS V m : Cut paper
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Compiles a ReceiptViewModel into ESC/POS binary format for hardware printers.
 */
export function buildEscPosReceipt(vm: ReceiptViewModel, columns: number = 42): Uint8Array {
  const p = new EscPosBuilder(columns);
  const currencySymbol = vm.store.currency === "USD" ? "$" : "BDT ";

  // Store Header
  p.alignCenter().doubleSize(true).bold(true).textLine(vm.store.name).doubleSize(false).bold(false);

  if (vm.store.address) p.textLine(vm.store.address);
  if (vm.store.phone) p.textLine(`Tel: ${vm.store.phone}`);
  if (vm.store.vatBinNumber) p.bold(true).textLine(`Mushak BIN: ${vm.store.vatBinNumber}`).bold(false);

  p.divider("-");

  // Invoice Meta
  p.alignLeft();
  p.twoColumnRow(`Inv: ${vm.sale.invoiceNumber}`, new Date(vm.sale.soldAt).toLocaleDateString("en-GB"));
  if (vm.sale.cashierName) {
    p.textLine(`Cashier: ${vm.sale.cashierName}`);
  }

  if (vm.customer) {
    p.textLine(`Customer: ${vm.customer.name}`);
    if (vm.customer.phone) p.textLine(`Phone: ${vm.customer.phone}`);
  }

  p.divider("-");

  // Items Header
  p.threeColumnRow("Item", "Qty", "Total");
  p.divider("-");

  for (const item of vm.items) {
    const itemTitle = item.variantName ? `${item.name} (${item.variantName})` : item.name;
    const formattedSubtotal = formatPoisha(item.subtotalPoisha, currencySymbol);

    if (itemTitle.length > p["columns"] - 18) {
      p.textLine(itemTitle);
      p.threeColumnRow("", item.quantity.toString(), formattedSubtotal);
    } else {
      p.threeColumnRow(itemTitle, item.quantity.toString(), formattedSubtotal);
    }

    if (item.serialNumbers && item.serialNumbers.length > 0) {
      p.textLine(`  S/N: ${item.serialNumbers.join(", ")}`);
    }
  }

  p.divider("-");

  // Financial Totals
  p.twoColumnRow("Subtotal:", formatPoisha(vm.totals.subtotalPoisha, currencySymbol));
  if (vm.totals.discountPoisha > 0) {
    p.twoColumnRow("Discount:", `-${formatPoisha(vm.totals.discountPoisha, currencySymbol)}`);
  }
  if (vm.totals.taxPoisha > 0) {
    p.twoColumnRow("VAT / Tax:", `+${formatPoisha(vm.totals.taxPoisha, currencySymbol)}`);
  }

  p.divider("=");
  p.bold(true).twoColumnRow("NET PAYABLE:", formatPoisha(vm.totals.totalPoisha, currencySymbol)).bold(false);
  p.divider("-");

  // Payments
  for (const payment of vm.payments) {
    p.twoColumnRow(`${payment.method}:`, formatPoisha(payment.amountPoisha, currencySymbol));
  }
  p.bold(true).twoColumnRow("Paid:", formatPoisha(vm.totals.paidPoisha, currencySymbol)).bold(false);

  if (vm.totals.changePoisha > 0) {
    p.twoColumnRow("Change:", formatPoisha(vm.totals.changePoisha, currencySymbol));
  }

  if (vm.totals.duePoisha > 0) {
    p.bold(true).twoColumnRow("CURRENT DUE:", formatPoisha(vm.totals.duePoisha, currencySymbol)).bold(false);
  }

  // QR Code
  p.lineFeed(1);
  p.qrCode(vm.sale.publicUrl);
  p.alignCenter().textLine("Scan to view digital receipt");

  // Footer
  p.lineFeed(1);
  if (vm.store.receiptFooter) {
    p.textLine(vm.store.receiptFooter);
  } else {
    p.textLine("Thank you for shopping with us!");
  }
  p.textLine("Powered by Dokani POS");

  p.cut();
  return p.build();
}
