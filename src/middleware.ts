import { NextResponse, type NextRequest } from "next/server";
import { applySecurityHeaders } from "@/lib/security/headers";
import { globalRateLimiter, RATE_LIMIT_POLICIES } from "@/lib/security/rate-limiter";

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

function isCsrfExempt(pathname: string): boolean {
  if (pathname.startsWith("/api/v1/")) return true;
  if (pathname.startsWith("/api/courier/webhook/")) return true;
  if (pathname.startsWith("/api/billing/webhook")) return true;
  if (pathname === "/api/health") return true;
  return false;
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const clientIp = getClientIp(req);

  // 1. Rate Limiting for Public APIs and Auth
  let rateLimitResult = null;

  if (pathname.startsWith("/api/v1/")) {
    const authHeader = req.headers.get("authorization") || req.headers.get("x-api-key") || clientIp;
    rateLimitResult = globalRateLimiter.check(
      `api_v1:${authHeader}`,
      RATE_LIMIT_POLICIES.API_V1_KEY.limit,
      RATE_LIMIT_POLICIES.API_V1_KEY.windowMs
    );
  } else if (pathname.startsWith("/api/auth/")) {
    rateLimitResult = globalRateLimiter.check(
      `auth:${clientIp}`,
      RATE_LIMIT_POLICIES.AUTH.limit,
      RATE_LIMIT_POLICIES.AUTH.windowMs
    );
  } else if (pathname.startsWith("/api/")) {
    rateLimitResult = globalRateLimiter.check(
      `api:${clientIp}`,
      RATE_LIMIT_POLICIES.GENERAL.limit,
      RATE_LIMIT_POLICIES.GENERAL.windowMs
    );
  }

  if (rateLimitResult && !rateLimitResult.allowed) {
    const response = NextResponse.json(
      {
        error: "Too Many Requests",
        message: `Rate limit exceeded. Please retry after ${rateLimitResult.retryAfterSeconds} seconds.`,
      },
      { status: 429 }
    );
    applySecurityHeaders(response.headers);
    response.headers.set("X-Request-Id", requestId);
    response.headers.set("X-RateLimit-Limit", String(rateLimitResult.limit));
    response.headers.set("X-RateLimit-Remaining", "0");
    response.headers.set("X-RateLimit-Reset", String(rateLimitResult.resetAt));
    response.headers.set("Retry-After", String(rateLimitResult.retryAfterSeconds));
    return response;
  }

  // 2. CSRF Verification for State-Changing Requests (POST, PUT, DELETE, PATCH)
  const isMutating = ["POST", "PUT", "DELETE", "PATCH"].includes(req.method);
  if (isMutating && !isCsrfExempt(pathname)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");

    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          const res = NextResponse.json(
            { error: "Forbidden", message: "Cross-site request forgery protection blocked this request." },
            { status: 403 }
          );
          applySecurityHeaders(res.headers);
          res.headers.set("X-Request-Id", requestId);
          return res;
        }
      } catch {
        const res = NextResponse.json({ error: "Forbidden", message: "Malformed Origin header." }, { status: 403 });
        applySecurityHeaders(res.headers);
        return res;
      }
    }
  }

  // 3. Continue Request with Correlation ID Header
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // 4. Apply Security Headers (A-Rating compliance) & Correlation ID
  applySecurityHeaders(response.headers);
  response.headers.set("X-Request-Id", requestId);

  if (rateLimitResult) {
    response.headers.set("X-RateLimit-Limit", String(rateLimitResult.limit));
    response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
    response.headers.set("X-RateLimit-Reset", String(rateLimitResult.resetAt));
  }

  return response;
}
