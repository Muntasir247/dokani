/**
 * Transactional Email Service & Provider Abstraction
 *
 * Supports Resend with graceful development/sandbox mock fallback.
 */

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface EmailProvider {
  name: string;
  sendEmail(options: SendEmailOptions): Promise<{ success: boolean; id?: string; error?: string }>;
}

export class ResendEmailProvider implements EmailProvider {
  public readonly name = "resend";
  private apiKey: string;
  private defaultFrom: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || "";
    this.defaultFrom = process.env.EMAIL_FROM || "Dokani POS <billing@dokani.app>";
  }

  async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.apiKey || process.env.NODE_ENV === "test") {
      // Mock / Dev mode fallback
      return { success: true, id: `mock_email_${Date.now()}` };
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: options.from || this.defaultFrom,
          to: options.to,
          subject: options.subject,
          html: options.html,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || "Failed to send email via Resend" };
      }

      return { success: true, id: data.id };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "Network error sending email" };
    }
  }
}

export class MockConsoleEmailProvider implements EmailProvider {
  public readonly name = "console-mock";

  async sendEmail(_options: SendEmailOptions): Promise<{ success: boolean; id?: string }> {
    return { success: true, id: `console_mock_${Date.now()}` };
  }
}

let emailProviderInstance: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!emailProviderInstance) {
    if (process.env.RESEND_API_KEY && process.env.NODE_ENV !== "test") {
      emailProviderInstance = new ResendEmailProvider();
    } else {
      emailProviderInstance = new MockConsoleEmailProvider();
    }
  }
  return emailProviderInstance;
}

// -----------------------------------------------------------------------------
// HTML Email Templates
// -----------------------------------------------------------------------------

export function generateWelcomeEmailHtml(params: {
  userName: string;
  storeName: string;
  loginUrl: string;
  trialDays?: number;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
      <h1 style="color: #0284c7; margin-bottom: 8px;">Welcome to Dokani, ${escapeHtml(params.userName)}!</h1>
      <p style="font-size: 14px; line-height: 1.5;">
        Your retail store <strong>${escapeHtml(params.storeName)}</strong> is officially onboarded.
        You have full access to Dokani with a <strong>${params.trialDays || 14}-day free trial</strong>.
      </p>
      <div style="margin: 24px 0;">
        <a href="${escapeHtml(params.loginUrl)}" style="background: #0284c7; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">
          Open POS Terminal
        </a>
      </div>
      <p style="font-size: 12px; color: #64748b;">
        Need help setting up barcode scanners or thermal printers? Reply directly to this email.
      </p>
    </div>
  `;
}

export function generateTrialEndingEmailHtml(params: {
  userName: string;
  storeName: string;
  daysLeft: number;
  upgradeUrl: string;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
      <h2 style="color: #d97706;">Your Dokani Trial Ends in ${params.daysLeft} Days</h2>
      <p style="font-size: 14px; line-height: 1.5;">
        Hello ${escapeHtml(params.userName)}, your 14-day free trial for <strong>${escapeHtml(params.storeName)}</strong>
        is concluding soon. To maintain uninterrupted access to your POS counter, sales history, and barcode catalog, upgrade to Pro or Business.
      </p>
      <div style="margin: 24px 0;">
        <a href="${escapeHtml(params.upgradeUrl)}" style="background: #0284c7; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">
          Upgrade Subscription
        </a>
      </div>
      <p style="font-size: 12px; color: #64748b;">
        Pay securely with bKash, Nagad, or Cards via SSLCommerz.
      </p>
    </div>
  `;
}

export function generatePaymentReceivedEmailHtml(params: {
  userName: string;
  storeName: string;
  invoiceNumber: string;
  amountBdt: string;
  planName: string;
  periodEnd: string;
  invoiceUrl: string;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
      <h2 style="color: #16a34a;">Payment Confirmed — Subscription Active</h2>
      <p style="font-size: 14px; line-height: 1.5;">
        Thank you, ${escapeHtml(params.userName)}! We have received your payment of <strong>৳${escapeHtml(params.amountBdt)}</strong>
        for the <strong>${escapeHtml(params.planName)}</strong>.
      </p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 13px;">
        <div><strong>Invoice #:</strong> ${escapeHtml(params.invoiceNumber)}</div>
        <div><strong>Store:</strong> ${escapeHtml(params.storeName)}</div>
        <div><strong>Valid Until:</strong> ${escapeHtml(params.periodEnd)}</div>
      </div>
      <div style="margin: 20px 0;">
        <a href="${escapeHtml(params.invoiceUrl)}" style="background: #0284c7; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px;">
          View / Download Receipt
        </a>
      </div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        Dokani POS &amp; Inventory SaaS • Bangladesh
      </div>
    </div>
  `;
}

export function generatePaymentFailedEmailHtml(params: {
  userName: string;
  storeName: string;
  graceDaysLeft: number;
  updatePaymentUrl: string;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
      <h2 style="color: #dc2626;">Payment Failed — 7-Day Grace Period Active</h2>
      <p style="font-size: 14px; line-height: 1.5;">
        Hello ${escapeHtml(params.userName)}, we were unable to process your subscription renewal for <strong>${escapeHtml(params.storeName)}</strong>.
      </p>
      <p style="font-size: 14px; line-height: 1.5;">
        Your store is in a <strong>${params.graceDaysLeft}-day grace period</strong>. You still have full write access, but your account will convert to read-only mode if payment is not completed before the grace period expires. Your data will never be deleted.
      </p>
      <div style="margin: 20px 0;">
        <a href="${escapeHtml(params.updatePaymentUrl)}" style="background: #dc2626; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px;">
          Update Payment Now
        </a>
      </div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        Dokani POS &amp; Inventory SaaS • Bangladesh
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m] || m));
}
