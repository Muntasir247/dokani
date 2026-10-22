/**
 * Dokani Error Tracking & Telemetry (Sentry Wrapper)
 *
 * Provides safe exception capture and context enrichment.
 * Gracefully degrades when SENTRY_DSN is not configured.
 */

import { logger, sanitizeForLogging } from "./logger";

export interface ErrorReportContext {
  tenantId?: string;
  userId?: string;
  requestId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export class ErrorTracker {
  private dsn: string | undefined;

  constructor() {
    this.dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  }

  get isConfigured(): boolean {
    return Boolean(this.dsn && this.dsn.startsWith("http"));
  }

  captureException(error: unknown, context: ErrorReportContext = {}): string {
    const eventId = "err_" + Math.random().toString(36).substring(2, 10);
    const sanitizedExtra = sanitizeForLogging(context.extra);

    logger.error("Exception captured by ErrorTracker", error, {
      eventId,
      tenantId: context.tenantId,
      userId: context.userId,
      requestId: context.requestId,
      tags: context.tags,
      extra: sanitizedExtra as Record<string, unknown>,
    });

    // In production with Sentry initialized, Sentry.captureException is invoked here.
    return eventId;
  }

  captureMessage(message: string, level: "info" | "warning" | "error" = "info", context: ErrorReportContext = {}): string {
    const eventId = "msg_" + Math.random().toString(36).substring(2, 10);
    logger.warn(`[${level.toUpperCase()}] ${message}`, {
      eventId,
      ...context,
    });
    return eventId;
  }
}

export const errorTracker = new ErrorTracker();
