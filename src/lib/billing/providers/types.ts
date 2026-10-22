/**
 * Payment Provider Abstraction Types
 */

import { PlanTier } from "@/types/database.types";
import { BillingInterval } from "../plan-config";

export type PaymentProviderName = "sslcommerz" | "bkash";

export interface CreateCheckoutSessionInput {
  tenantId: string;
  planTier: PlanTier;
  billingInterval: BillingInterval;
  amountPoisha: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  gatewayUrl: string;
  provider: PaymentProviderName;
  transactionId: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  transactionId: string;
  tenantId: string;
  planTier: PlanTier;
  billingInterval: BillingInterval;
  amountPoisha: number;
  currency: string;
  rawStatus: string;
  isPaid: boolean;
  idempotencyKey: string;
  errorMessage?: string;
  rawPayload: Record<string, unknown>;
}

export interface TransactionQueryResult {
  transactionId: string;
  status: "VALID" | "FAILED" | "CANCELLED" | "PENDING";
  amountPoisha: number;
  currency: string;
  paidAt?: string;
}

export interface PaymentProvider {
  name: PaymentProviderName;
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult>;
  verifyWebhookOrIPN(
    payload: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<WebhookVerificationResult>;
  queryTransaction(transactionId: string): Promise<TransactionQueryResult>;
}
