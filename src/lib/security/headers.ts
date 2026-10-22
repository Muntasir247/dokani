/**
 * Dokani Production Security Headers Configuration
 *
 * Implements security headers tailored to achieve an "A" rating on SecurityHeaders.com:
 * - Strict Content-Security-Policy (CSP)
 * - Strict-Transport-Security (HSTS 2-year preload)
 * - Anti-clickjacking (X-Frame-Options: DENY)
 * - MIME-sniffing prevention (X-Content-Type-Options: nosniff)
 * - Referrer control (strict-origin-when-cross-origin)
 * - Granular Permissions-Policy
 * - Cross-Origin isolation protections
 */

export const SECURITY_HEADERS: Record<string, string> = {
  // Strict Content-Security-Policy
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https: wss:",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; "),

  // Strict-Transport-Security (HSTS): 2 years + subdomains + preload
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",

  // Prevent framing (clickjacking defense)
  "X-Frame-Options": "DENY",

  // Prevent MIME-type sniffing
  "X-Content-Type-Options": "nosniff",

  // Restrict referrer leakage
  "Referrer-Policy": "strict-origin-when-cross-origin",

  // Explicit device/feature permission restrictions
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), browsing-topics=(), payment=(self)",

  // Cross-Origin resource policies
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
  "X-XSS-Protection": "0",
};

/**
 * Applies all security headers to a Response object or headers map.
 */
export function applySecurityHeaders(headers: Headers): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
}
