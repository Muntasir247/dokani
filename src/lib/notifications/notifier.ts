import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getEmailProvider } from "@/lib/email";
import { formatBDT } from "@/lib/money";

export interface NotificationPayload {
  tenantId: string;
  type: "low_stock" | "large_discount" | "daily_summary" | "shift_variance" | "system";
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export class NotificationService {
  /**
   * Records an in-app notification in the database
   */
  static async createInAppNotification(payload: NotificationPayload): Promise<{ success: boolean; id?: string }> {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = (await (supabase.from("notifications") as any)
        .insert({
          tenant_id: payload.tenantId,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          data: payload.data || {},
          is_read: false,
        })
        .select("id")
        .single()) as { data: { id: string } | null; error: { message: string } | null };

      if (error) {
        console.warn("[NotificationService] In-app notification insert error:", error.message);
        return { success: false };
      }

      return { success: true, id: data?.id };
    } catch (err: unknown) {
      console.warn("[NotificationService] Exception saving in-app alert:", err);
      return { success: false };
    }
  }

  /**
   * Optionally sends a message to Telegram channel/chat if bot credentials are provided
   */
  static async sendTelegramAlert(text: string): Promise<boolean> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId || process.env.NODE_ENV === "test") {
      return true; // No-op in dev/test or when unconfigured
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
        }),
      });
      return res.ok;
    } catch (err) {
      console.warn("[NotificationService] Telegram alert dispatch failed:", err);
      return false;
    }
  }

  /**
   * Dispatches a Low-Stock alert (In-app + Optional Email/Telegram)
   */
  static async notifyLowStock(params: {
    tenantId: string;
    productName: string;
    variantSku: string;
    currentStock: number;
    reorderLevel: number;
    ownerEmail?: string;
  }): Promise<void> {
    const title = `Low Stock Alert: ${params.productName}`;
    const message = `Stock for "${params.productName}" (SKU: ${params.variantSku}) has reached ${params.currentStock} units (Reorder level: ${params.reorderLevel}).`;

    await this.createInAppNotification({
      tenantId: params.tenantId,
      type: "low_stock",
      title,
      message,
      data: params,
    });

    if (params.ownerEmail) {
      const emailProvider = getEmailProvider();
      await emailProvider.sendEmail({
        to: params.ownerEmail,
        subject: `[Dokani Alert] Low Stock: ${params.productName}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
            <h2 style="color: #ea580c;">⚠️ Low Stock Warning</h2>
            <p style="font-size: 14px;">The following item requires reordering:</p>
            <div style="background: #fff7ed; border-left: 4px solid #ea580c; padding: 12px; margin: 16px 0;">
              <strong>${params.productName}</strong><br/>
              <span style="font-size: 13px; color: #7c2d12;">SKU: ${params.variantSku} | Current Stock: <strong>${params.currentStock}</strong> | Reorder Level: ${params.reorderLevel}</span>
            </div>
          </div>
        `,
      });
    }

    await this.sendTelegramAlert(`⚠️ *Low Stock Alert*\n*Product:* ${params.productName}\n*SKU:* \`${params.variantSku}\`\n*Remaining:* ${params.currentStock} (Reorder: ${params.reorderLevel})`);
  }

  /**
   * Dispatches a Large-Discount alert (In-app + Optional Email/Telegram)
   */
  static async notifyLargeDiscount(params: {
    tenantId: string;
    invoiceNumber: string;
    discountAmountPoisha: number;
    discountPercentage?: number;
    totalAmountPoisha: number;
    cashierName?: string;
    ownerEmail?: string;
  }): Promise<void> {
    const title = `Large Discount Alert: Invoice #${params.invoiceNumber}`;
    const message = `A large discount of ${formatBDT(params.discountAmountPoisha)} (${params.discountPercentage || 0}%) was applied to invoice #${params.invoiceNumber}.`;

    await this.createInAppNotification({
      tenantId: params.tenantId,
      type: "large_discount",
      title,
      message,
      data: params,
    });

    if (params.ownerEmail) {
      const emailProvider = getEmailProvider();
      await emailProvider.sendEmail({
        to: params.ownerEmail,
        subject: `[Dokani Alert] Large Discount Applied on #${params.invoiceNumber}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
            <h2 style="color: #7c3aed;">🏷️ High Discount Warning</h2>
            <p style="font-size: 14px;">A significant discount exceeded threshold:</p>
            <div style="background: #f5f3ff; border-left: 4px solid #7c3aed; padding: 12px; margin: 16px 0;">
              <strong>Invoice: #${params.invoiceNumber}</strong><br/>
              <span>Discount Amount: <strong>${formatBDT(params.discountAmountPoisha)}</strong></span><br/>
              <span>Net Invoice Total: ${formatBDT(params.totalAmountPoisha)}</span>
            </div>
          </div>
        `,
      });
    }

    await this.sendTelegramAlert(`🏷️ *Large Discount Applied*\n*Invoice:* #${params.invoiceNumber}\n*Discount:* ${formatBDT(params.discountAmountPoisha)}\n*Total:* ${formatBDT(params.totalAmountPoisha)}`);
  }

  /**
   * Dispatches Shift Variance Discrepancy Alert
   */
  static async notifyShiftVariance(params: {
    tenantId: string;
    sessionId: string;
    cashierName: string;
    variancePoisha: number;
    expectedCashPoisha: number;
    countedCashPoisha: number;
    ownerEmail?: string;
  }): Promise<void> {
    const isShortage = params.variancePoisha < 0;
    const absDiff = Math.abs(params.variancePoisha);
    const title = `Cash Drawer Discrepancy (${isShortage ? "Shortage" : "Surplus"})`;
    const message = `Shift closed by ${params.cashierName} has a discrepancy of ${formatBDT(absDiff)} (${isShortage ? "Shortage" : "Surplus"}). Expected: ${formatBDT(params.expectedCashPoisha)}, Counted: ${formatBDT(params.countedCashPoisha)}.`;

    await this.createInAppNotification({
      tenantId: params.tenantId,
      type: "shift_variance",
      title,
      message,
      data: params,
    });

    if (params.ownerEmail) {
      const emailProvider = getEmailProvider();
      await emailProvider.sendEmail({
        to: params.ownerEmail,
        subject: `[Dokani Alert] Cash Drawer Shift Discrepancy`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
            <h2 style="color: #dc2626;">🚨 Cash Drawer Discrepancy Alert</h2>
            <p style="font-size: 14px;">A cashier shift was closed with an unverified cash variance:</p>
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 16px 0;">
              <strong>Cashier: ${params.cashierName}</strong><br/>
              <span>Discrepancy: <strong style="color: #dc2626;">${isShortage ? "-" : "+"}${formatBDT(absDiff)}</strong></span><br/>
              <span>System Expected: ${formatBDT(params.expectedCashPoisha)} | Counted: ${formatBDT(params.countedCashPoisha)}</span>
            </div>
          </div>
        `,
      });
    }

    await this.sendTelegramAlert(`🚨 *Cash Drawer Discrepancy*\n*Cashier:* ${params.cashierName}\n*Variance:* ${isShortage ? "-" : "+"}${formatBDT(absDiff)}\n*Expected:* ${formatBDT(params.expectedCashPoisha)}\n*Counted:* ${formatBDT(params.countedCashPoisha)}`);
  }

  /**
   * Dispatches Daily Summary Email to Store Owner
   */
  static async notifyDailySummary(params: {
    tenantId: string;
    tenantName: string;
    ownerEmail: string;
    targetDate: string;
    totalRevenuePoisha: number;
    grossProfitPoisha: number;
    invoicesCount: number;
    cashCollectedPoisha: number;
    digitalCollectedPoisha: number;
    duePoisha: number;
  }): Promise<void> {
    const title = `Daily Performance Summary (${params.targetDate})`;
    const message = `Today's revenue: ${formatBDT(params.totalRevenuePoisha)} across ${params.invoicesCount} orders. Gross profit: ${formatBDT(params.grossProfitPoisha)}.`;

    await this.createInAppNotification({
      tenantId: params.tenantId,
      type: "daily_summary",
      title,
      message,
      data: params,
    });

    const emailProvider = getEmailProvider();
    await emailProvider.sendEmail({
      to: params.ownerEmail,
      subject: `[${params.tenantName}] Daily Store Performance Summary - ${params.targetDate}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
          <h2 style="color: #0284c7; margin-bottom: 4px;">📊 Daily Store Summary</h2>
          <p style="font-size: 14px; color: #64748b; margin-top: 0;">Date: ${params.targetDate} • ${params.tenantName}</p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0;">
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px; border-radius: 8px;">
              <div style="font-size: 12px; color: #15803d; font-weight: bold; text-transform: uppercase;">Total Revenue</div>
              <div style="font-size: 22px; font-weight: bold; color: #166534; margin-top: 4px;">${formatBDT(params.totalRevenuePoisha)}</div>
            </div>
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 14px; border-radius: 8px;">
              <div style="font-size: 12px; color: #1d4ed8; font-weight: bold; text-transform: uppercase;">Gross Profit</div>
              <div style="font-size: 22px; font-weight: bold; color: #1e40af; margin-top: 4px;">${formatBDT(params.grossProfitPoisha)}</div>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Completed Invoices</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold;">${params.invoicesCount}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Cash In Hand Collected</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatBDT(params.cashCollectedPoisha)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Digital (bKash/Nagad/Card)</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatBDT(params.digitalCollectedPoisha)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Receivables Due (Khata)</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #d97706;">${formatBDT(params.duePoisha)}</td>
            </tr>
          </table>
        </div>
      `,
    });

    await this.sendTelegramAlert(`📊 *Daily Store Summary: ${params.tenantName}*\n*Date:* ${params.targetDate}\n*Revenue:* ${formatBDT(params.totalRevenuePoisha)} (${params.invoicesCount} orders)\n*Gross Profit:* ${formatBDT(params.grossProfitPoisha)}\n*Cash:* ${formatBDT(params.cashCollectedPoisha)} | *Digital:* ${formatBDT(params.digitalCollectedPoisha)}`);
  }
}
