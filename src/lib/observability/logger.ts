/**
 * Dokani Structured Observability Logger
 *
 * Provides JSON-structured logging with request correlation IDs, context binding,
 * and automatic redaction of sensitive credentials, secrets, and PII.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  action?: string;
  path?: string;
  method?: string;
  ip?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// Patterns & keys that must never be leaked to logs
const SENSITIVE_KEY_REGEX =
  /(password|secret|token|api_key|apikey|authorization|auth_token|cookie|credentials|card|cvv|pin|phone|mobile|email|access_token|refresh_token)/i;

const PHONE_REGEX = /(\+?8801|01)[3-9]\d{8}/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Recursively redacts PII and sensitive fields from any object or primitive.
 */
export function sanitizeForLogging(obj: unknown, depth = 0): unknown {
  if (depth > 6) return "[MAX_DEPTH_REACHED]";
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    // Redact phone numbers and emails inside strings
    return obj
      .replace(PHONE_REGEX, "[REDACTED_PHONE]")
      .replace(EMAIL_REGEX, "[REDACTED_EMAIL]");
  }

  if (typeof obj === "number" || typeof obj === "boolean") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLogging(item, depth + 1));
  }

  if (typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        cleaned[key] = "[REDACTED]";
      } else {
        cleaned[key] = sanitizeForLogging(value, depth + 1);
      }
    }
    return cleaned;
  }

  return String(obj);
}

export class Logger {
  private defaultContext: LogContext;

  constructor(context: LogContext = {}) {
    this.defaultContext = context;
  }

  withContext(context: LogContext): Logger {
    return new Logger({ ...this.defaultContext, ...context });
  }

  private write(level: LogLevel, message: string, meta?: LogContext, err?: unknown): void {
    const mergedContext = sanitizeForLogging({
      ...this.defaultContext,
      ...meta,
    }) as LogContext;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(Object.keys(mergedContext).length > 0 ? { context: mergedContext } : {}),
    };

    if (err instanceof Error) {
      entry.error = {
        name: err.name,
        message: err.message,
        stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
      };
    } else if (err) {
      entry.error = {
        name: "UnknownError",
        message: String(err),
      };
    }

    const json = JSON.stringify(entry);

    if (level === "error") {
      console.error(json);
    } else if (level === "warn") {
      console.warn(json);
    } else if (level === "debug") {
      if (process.env.NODE_ENV !== "production") {
        console.debug(json);
      }
    } else {
      console.log(json);
    }
  }

  debug(message: string, meta?: LogContext): void {
    this.write("debug", message, meta);
  }

  info(message: string, meta?: LogContext): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: LogContext, err?: unknown): void {
    this.write("warn", message, meta, err);
  }

  error(message: string, err?: unknown, meta?: LogContext): void {
    this.write("error", message, meta, err);
  }
}

export const logger = new Logger();
