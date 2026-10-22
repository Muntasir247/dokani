import { describe, it, expect, beforeEach } from "vitest";
import { SlidingWindowRateLimiter } from "@/lib/security/rate-limiter";

describe("Sliding Window Rate Limiter", () => {
  let limiter: SlidingWindowRateLimiter;

  beforeEach(() => {
    limiter = new SlidingWindowRateLimiter();
  });

  it("permits requests within quota and updates remaining count", () => {
    const key = "test_ip_1";
    const limit = 5;
    const windowMs = 10000;

    const res1 = limiter.check(key, limit, windowMs);
    expect(res1.allowed).toBe(true);
    expect(res1.limit).toBe(5);
    expect(res1.remaining).toBe(4);

    const res2 = limiter.check(key, limit, windowMs);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(3);
  });

  it("blocks requests once quota is exceeded and returns Retry-After", () => {
    const key = "test_ip_blocked";
    const limit = 3;
    const windowMs = 10000;

    // Use up quota
    limiter.check(key, limit, windowMs); // remaining 2
    limiter.check(key, limit, windowMs); // remaining 1
    const res3 = limiter.check(key, limit, windowMs); // remaining 0
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);

    // 4th request exceeds limit
    const res4 = limiter.check(key, limit, windowMs);
    expect(res4.allowed).toBe(false);
    expect(res4.remaining).toBe(0);
    expect(res4.retryAfterSeconds).toBeGreaterThan(0);
    expect(res4.retryAfterSeconds).toBeLessThanOrEqual(10);
  });

  it("resets rate limit correctly", () => {
    const key = "test_reset";
    limiter.check(key, 1, 10000);
    const blocked = limiter.check(key, 1, 10000);
    expect(blocked.allowed).toBe(false);

    limiter.reset(key);
    const allowedAfterReset = limiter.check(key, 1, 10000);
    expect(allowedAfterReset.allowed).toBe(true);
  });
});
