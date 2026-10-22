import { describe, it, expect } from "vitest";
import { SECURITY_HEADERS, applySecurityHeaders } from "@/lib/security/headers";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

/**
 * SecurityHeaders.com scoring emulator:
 * Requires:
 * - Content-Security-Policy
 * - Strict-Transport-Security
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - Referrer-Policy
 * - Permissions-Policy
 */
function evaluateSecurityHeadersScore(headers: Record<string, string>): { grade: string; passes: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!headers["content-security-policy"] && !headers["Content-Security-Policy"]) {
    missing.push("Content-Security-Policy");
  }
  if (!headers["strict-transport-security"] && !headers["Strict-Transport-Security"]) {
    missing.push("Strict-Transport-Security");
  }
  if (!headers["x-frame-options"] && !headers["X-Frame-Options"]) {
    missing.push("X-Frame-Options");
  }
  if (!headers["x-content-type-options"] && !headers["X-Content-Type-Options"]) {
    missing.push("X-Content-Type-Options");
  }
  if (!headers["referrer-policy"] && !headers["Referrer-Policy"]) {
    missing.push("Referrer-Policy");
  }
  if (!headers["permissions-policy"] && !headers["Permissions-Policy"]) {
    missing.push("Permissions-Policy");
  }

  // Check HSTS parameters
  const hsts = headers["strict-transport-security"] || headers["Strict-Transport-Security"] || "";
  const hstsMaxAgeMatch = hsts.match(/max-age=(\d+)/);
  const hstsMaxAge = hstsMaxAgeMatch ? parseInt(hstsMaxAgeMatch[1], 10) : 0;
  const hstsPreload = hsts.includes("preload") && hsts.includes("includeSubDomains");

  // Check CSP directives
  const csp = headers["content-security-policy"] || headers["Content-Security-Policy"] || "";
  const cspHasDefault = csp.includes("default-src");
  const cspHasFrameAncestors = csp.includes("frame-ancestors 'none'") || csp.includes("frame-ancestors 'self'");

  const passes =
    missing.length === 0 &&
    hstsMaxAge >= 31536000 && // At least 1 year (Dokani uses 2 years: 63072000)
    hstsPreload &&
    cspHasDefault &&
    cspHasFrameAncestors;

  const grade = passes ? "A" : missing.length <= 1 ? "B" : "F";

  return { grade, passes, missing };
}

describe("Acceptance Criterion: Security Headers & Hardening (A Rating)", () => {
  it("satisfies all SecurityHeaders.com criteria for an A rating", () => {
    const evaluation = evaluateSecurityHeadersScore(SECURITY_HEADERS);

    expect(evaluation.missing).toEqual([]);
    expect(evaluation.passes).toBe(true);
    expect(evaluation.grade).toBe("A");
  });

  it("applies complete set of headers to a Headers instance", () => {
    const headers = new Headers();
    applySecurityHeaders(headers);

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(headers.get("Permissions-Policy")).toContain("camera=(self)");
  });

  describe("Middleware Security & CSRF Defense", () => {
    it("attaches security headers and correlation ID to incoming requests", () => {
      const req = new NextRequest("http://localhost:3000/dashboard", {
        headers: { host: "localhost:3000" },
      });

      const res = middleware(req);

      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("X-Request-Id")).toBeDefined();
      expect(res.headers.get("Content-Security-Policy")).toBeDefined();
    });

    it("blocks cross-site mutating requests with CSRF 403 when origin header mismatches", () => {
      const req = new NextRequest("http://localhost:3000/api/settings/update", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "https://evil-attacker.com", // Mismatched malicious origin
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(403);
    });

    it("permits mutating requests when origin matches host", () => {
      const req = new NextRequest("http://localhost:3000/api/settings/update", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
      });

      const res = middleware(req);
      expect(res.status).not.toBe(403);
    });

    it("exempts external webhooks and public v1 endpoints from origin CSRF checks", () => {
      const webhookReq = new NextRequest("http://localhost:3000/api/courier/webhook/steadfast", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "https://steadfast.com.bd",
        },
      });

      const res = middleware(webhookReq);
      expect(res.status).not.toBe(403);
    });
  });
});
