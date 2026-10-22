# Dokani POS SaaS Security Model & Operations Runbook

## 1. Threat Model & Architectural Overview

Dokani POS is a multi-tenant cloud & offline point-of-sale SaaS engineered for high availability and zero trust. The threat modeling approach utilizes STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) combined with OWASP Top 10 2021 mitigations.

```
+-------------------------------------------------------------------------+
|                              EDGE / PROXY                               |
|   Security Headers (CSP, HSTS, X-Frame-Options) | Sliding Rate Limiter   |
|   CSRF Origin Verification | SSL Termination (TLS 1.3)                  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                             API LAYER                                   |
|   Versioned Routes (/api/v1) | Zod Schema Validation                    |
|   Tenant API Keys (SHA-256)  | Webhook Signatures (HMAC-SHA256)         |
|   Masked Observability Logs  | Request Correlation IDs                  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                          DATABASE LAYER                                 |
|   PostgreSQL Row Level Security (RLS) | Atomic Trans. RPCs              |
|   Courier Credentials Encrypted at Rest (AES-256-GCM)                   |
|   Soft-deletion with 30-Day Retention Grace Period                      |
+-------------------------------------------------------------------------+
```

---

## 2. STRIDE Threat Mitigation Matrix

| Threat | Risk Vector | Mitigation in Dokani |
| :--- | :--- | :--- |
| **Spoofing** | Forged user identities, stolen API keys, spoofed webhooks | API keys use cryptographically random tokens (`dk_live_...`) with SHA-256 hashes at rest; outgoing webhooks are signed with HMAC-SHA256 (`X-Dokani-Signature`); session auth verified via Supabase SSR JWT. |
| **Tampering** | Altering price/discount on POS cart before submitting | Server-side price enforcement via `fn_create_pos_sale`; client prices and totals are never trusted; role-based max discount limits enforced inside the transactional RPC. |
| **Repudiation** | Denying dispatch or transaction actions | Audit logs on all mutations, cash drawer close variance logs, immutable `stock_movements`, and `webhook_deliveries` audit ledger. |
| **Information Disclosure** | Multi-tenant cross-talk or credential leak | PostgreSQL Row Level Security (RLS) on all tenant tables; courier API keys encrypted at rest via AES-256-GCM; PII scrubbing in logging engine. |
| **Denial of Service** | Public endpoint brute-force, inventory exhaustion | In-memory sliding-window rate limiter; duplicate-dispatch database constraints (`idx_unique_active_sale_shipment`); client concurrency locks. |
| **Elevation of Privilege** | Cashier bypassing roles or upgrading plan free | Server-side plan guards (`assertFeatureEnabled`, `assertCanCreateProduct`); RLS role checks (`user_tenants.role IN ('owner', 'admin')`). |

---

## 3. Security Headers & Browser Hardening

Configured in `src/middleware.ts` to score an **A** grade on SecurityHeaders.com:

1. **Content-Security-Policy (CSP)**:
   ```http
   default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none';
   ```
2. **Strict-Transport-Security (HSTS)**:
   `max-age=63072000; includeSubDomains; preload` (2-year preload compliant).
3. **Anti-Clickjacking**:
   `X-Frame-Options: DENY` and `frame-ancestors 'none'`.
4. **MIME-Type Sniffing Protection**:
   `X-Content-Type-Options: nosniff`.
5. **Referrer Control**:
   `Referrer-Policy: strict-origin-when-cross-origin`.
6. **Feature & Hardware Permissions**:
   `Permissions-Policy: camera=(self), microphone=(), geolocation=(), browsing-topics=(), payment=(self)`.
7. **Cross-Origin Protections**:
   `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin`.

---

## 4. Rate Limiting Policy

Sliding window rate limiter implemented in `src/lib/security/rate-limiter.ts`:

| Route Category | Rate Limit | Scope | Standard Headers |
| :--- | :--- | :--- | :--- |
| **Public REST API** (`/api/v1/*`) | 120 req / min | Per API Key (or IP) | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |
| **Authentication** (`/api/auth/*`) | 10 req / min | Per IP | HTTP 429 + `Retry-After: <seconds>` |
| **General Web API** (`/api/*`) | 300 req / min | Per IP | Standard headers |

---

## 5. Cryptography & Key Management

- **Courier Credentials at Rest**:
  - Encrypted with AES-256-GCM using an authenticated 128-bit authentication tag and unique 12-byte initialization vector (`iv`) per secret.
  - Secret key: Derived from `COURIER_ENCRYPTION_KEY` (32 bytes).
- **Public API Keys**:
  - Plaintext: `dk_live_<12_hex_prefix>_<32_hex_secret>`.
  - Database stores: SHA-256 hex digest in `key_hash`.
  - Prefix stored in plaintext (`key_prefix`) for identification in developer consoles.
  - Revocation is atomic: setting `revoked_at` stops key validation immediately.
- **Outgoing Webhook Signatures**:
  - HMAC-SHA256 signature generated over `${timestamp}.${rawBody}`.
  - Delivered via header: `X-Dokani-Signature: t=<timestamp>,v1=<signature>`.
  - Constant-time verification using `crypto.timingSafeEqual` with a 5-minute anti-replay window.

---

## 6. Observability & Zero-PII Policy

Structured logger configured in `src/lib/observability/logger.ts`:
- All log outputs are single-line JSON format with request correlation ID (`x-request-id`).
- Automated redaction filter scrubs:
  - Passwords, API keys, bearer tokens, cookies, auth headers.
  - Credit card numbers and bKash/Nagad PINs.
  - Customer Bangladesh phone numbers (`+8801...` replaced with `[REDACTED_PHONE]`).
  - Customer emails (replaced with `[REDACTED_EMAIL]`).
- Health Check route (`/api/health`) exposes latency, memory RSS, and database connectivity.

---

## 7. Data Protection, Export & Deletion Lifecycle

### Full Tenant Data Export
- Endpoint: `GET /api/tenant/export?tenant_id=<id>`
- Output: Structured JSON payload containing complete tenant catalog, sales, stock ledger, customers, shifts, and shipments.
- Authorization: Restricted to `owner` or `admin` role.

### Tenant Deletion Workflow
- Step 1: Owner requests deletion (`POST /api/tenant/delete`).
- Step 2: System transitions status to `pending_deletion`, records `deletion_scheduled_at`, and sets `retention_purge_after = NOW() + 30 days`.
- Step 3: During the 30-day grace period, the owner can cancel deletion (`DELETE /api/tenant/delete`) to restore active operations.
- Step 4: After 30 days, an automated purge job removes all tenant data.

---

## 8. Database Backup & Restore SOP

### Automated Daily Logical Backups
To run an automated full snapshot of the Dokani PostgreSQL cluster:
```bash
# 1. Export database dump with custom compressed format
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --dbname="$DATABASE_URL" \
  --file="dokani_backup_$(date +%Y%m%d_%H%M%S).dump"

# 2. Upload to cold encrypted object storage (e.g. S3 / R2)
aws s3 cp dokani_backup_*.dump s3://dokani-database-backups/prod/ --sse aws:kms
```

### Point-in-Time Restore Verification
To test and verify restoring from a backup dump:
```bash
# 1. Create a clean staging database
createdb -h localhost -U postgres dokani_restore_test

# 2. Restore schema, tables, and transactional RPCs
pg_restore \
  --dbname=dokani_restore_test \
  --clean \
  --if-exists \
  --no-owner \
  dokani_backup_*.dump

# 3. Verify RLS integrity and row counts
psql -d dokani_restore_test -c "SELECT count(*) FROM tenants; SELECT count(*) FROM sales;"
```
