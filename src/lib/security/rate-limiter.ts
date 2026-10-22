/**
 * Dokani Sliding Window In-Memory Rate Limiter
 *
 * Provides thread-safe, sliding-window rate limiting for auth endpoints,
 * public API v1 endpoints, and general web traffic.
 * Generates standard rate limit headers (X-RateLimit-* and Retry-After).
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
  retryAfterSeconds: number;
}

interface WindowEntry {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private store: Map<string, WindowEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup periodically every 5 minutes in long-running processes
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  /**
   * Check if a request identified by `key` is allowed under `limit` requests per `windowMs`.
   */
  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Filter out timestamps outside current sliding window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    const currentCount = entry.timestamps.length;
    const allowed = currentCount < limit;

    if (allowed) {
      entry.timestamps.push(now);
    }

    const remaining = Math.max(0, limit - (allowed ? currentCount + 1 : currentCount));
    const oldestTimestamp = entry.timestamps[0] || now;
    const resetTimeMs = oldestTimestamp + windowMs;
    const resetAt = Math.ceil(resetTimeMs / 1000);
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

    return {
      allowed,
      limit,
      remaining,
      resetAt,
      retryAfterSeconds: allowed ? 0 : retryAfterSeconds,
    };
  }

  /**
   * Clear all or specific rate limit entries (useful for testing).
   */
  reset(key?: string): void {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    // Default 1 hour max expiry for abandoned keys
    const threshold = now - 60 * 60 * 1000;
    for (const [key, entry] of this.store.entries()) {
      entry.timestamps = entry.timestamps.filter((ts) => ts > threshold);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}

export const globalRateLimiter = new SlidingWindowRateLimiter();

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT_POLICIES: Record<string, RateLimitPolicy> = {
  // Public REST API keys: 120 req / min
  API_V1_KEY: { limit: 120, windowMs: 60 * 1000 },
  // Auth endpoints (login, password reset): 10 req / min per IP
  AUTH: { limit: 10, windowMs: 60 * 1000 },
  // General web endpoints: 300 req / min per IP
  GENERAL: { limit: 300, windowMs: 60 * 1000 },
  // Public tracking / invoice lookup: 30 req / min per IP
  PUBLIC_LOOKUP: { limit: 30, windowMs: 60 * 1000 },
};
