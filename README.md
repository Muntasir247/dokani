# Dokani (দোকানী) — Multi-Tenant, Offline-First Retail POS & Inventory SaaS

Dokani is a modern, high-performance Point-of-Sale (POS) and inventory SaaS built for small and mid-size retail shops in Bangladesh (electronics, fashion, grocery, gadget accessories). Designed to thrive on weak or intermittent internet, it guarantees that cashiers never stop selling even when completely offline.

---

## Architecture Overview

* **Framework**: Next.js 15 (App Router), TypeScript (strict mode), Tailwind CSS
* **Database & Auth**: Supabase (PostgreSQL, Row Level Security, Auth, RPC functions)
* **Offline Engine**: Dexie.js (IndexedDB) with an append-only ledger, outbox synchronization queue, client-side UUID v7 keys, and automatic background sync
* **Hardware Support**: Barcode scanner wedge input (<100ms scan-to-cart latency), camera barcode scanning fallback, 80mm thermal receipt printing, and A4 tax invoices
* **SaaS Billing & Gateways**: Single-config plan enforcement (`src/lib/billing/plan-config.ts`), SSLCommerz (primary, cards/Nagad), bKash Tokenized Checkout, deterministic lifecycle state machine, and a dedicated internal Super-Admin portal

---

## Subscription Plans & Feature Enforcement

All plan limits and feature flags are declared in a single source of truth (`src/lib/billing/plan-config.ts`), driving both user interfaces and server-side RPC guards (`fn_check_plan_limits`):

| Feature / Limit | Free Starter | Pro Merchant | Business Enterprise |
| :--- | :---: | :---: | :---: |
| **Monthly Price** | ৳0 | ৳1,500 / mo | ৳4,000 / mo |
| **Yearly Price** | ৳0 | ৳15,000 / yr | ৳40,000 / yr |
| **Branches / Stores** | 1 Store | 3 Outlets | 999 Outlets |
| **Staff Members** | 2 Staff | 10 Staff | 999 Staff |
| **Catalog Products** | 200 Products | 5,000 Products | 100,000 Products |
| **Multi-Branch Transfers** | ❌ | ✅ | ✅ |
| **IMEI / Serial Tracking** | ❌ | ✅ | ✅ |
| **CSV Reports Export** | ❌ | ✅ | ✅ |
| **Custom Barcode Generator** | ❌ | ✅ | ✅ |
| **Customer Loyalty Rewards** | ❌ | ✅ | ✅ |
| **B2B Wholesale & Credit** | ❌ | ✅ | ✅ |
| **Developer API Access** | ❌ | ❌ | ✅ |

### Server-Side & RPC Enforcement
Plan limits cannot be bypassed by calling API endpoints directly:
- `assertCanCreateResource(supabase, tenantId, "products" | "staff" | "stores")` verifies real-time resource count against plan caps before executing DB inserts.
- `assertFeatureEnabled(supabase, tenantId, "serialTracking" | "exportReports" | ...)` verifies feature flag authorization.
- Custom application errors: `PlanLimitExceededError`, `SubscriptionReadOnlyError`, and `FeatureNotAllowedError`.

---

## Subscription Lifecycle & Read-Only Grace Policy

Subscriptions operate as a pure deterministic state machine (`src/lib/billing/lifecycle.ts`):

```
New Onboarding ──> 14-Day Free Trial (Full Access)
                         │
                         ▼
                  Active Subscription (Paid Tier)
                         │ (Payment Renewal Fails)
                         ▼
              7-Day Grace Period (Full Write Access)
                         │ (Grace Period Expires)
                         ▼
              Read-Only Mode (Store Data Never Deleted)
```

1. **Trial (14 Days)**: Newly onboarded shops receive a 14-day full-access trial.
2. **Active**: Paid subscription in good standing.
3. **Past Due (7-Day Grace Period)**: When a payment fails or billing period lapses, shops enter a 7-day grace period where counter checkout and product creation remain operational.
4. **Read-Only Mode**: If unpaid after the 7-day grace period, all create/update endpoints are locked with `SubscriptionReadOnlyError`. **Merchant data is never deleted**, and owners can still log in, review sales history, and export catalog/ledger CSV data.
5. **Canceled**: Subscriptions canceled at period end maintain access until the end of the paid billing period.

---

## Payment Gateways & Webhook Security

Abstracted behind the `PaymentProvider` interface (`src/lib/billing/providers`):

### 1. SSLCommerz (Primary, Bangladesh)
- Session initialization via `POST /gwprocess/v4/api.php` (`gw_init`).
- MD5 cryptographic signature validation (`generateVerificationHash`) computed across sorted verify parameters using `SSLCOMMERZ_STORE_PASSWD`.
- Verification against SSLCommerz merchant Order Validation API (`merchantTransIDvalidationAPI.php`).

### 2. bKash Tokenized Checkout
- Token grant authentication (`/tokenized/checkout/token/grant`).
- Payment session creation (`/tokenized/checkout/create`).
- Execution callback verification and status query.

### 3. Replay Protection & Idempotency
- Incoming IPN webhooks log a unique `idempotency_key` (`sslcz_${tranId}_${valId}`) to the `payment_webhooks_log` table.
- Replayed or duplicate webhooks are acknowledged with HTTP 200 without modifying subscriptions or sending duplicate invoice receipts.

---

## Super-Admin Governance Portal (`/admin`)

An isolated platform administration area accessible only to users with `profiles.is_super_admin = true`:
- **Tenant Overview**: Real-time status, active plan tier, branch count, staff count, and product usage meters.
- **Manual Trial Extension**: Atomic RPC `fn_admin_extend_trial(tenantId, days)`.
- **Plan Override**: Atomic RPC `fn_admin_set_plan(tenantId, plan, status, maxStores, maxProducts, maxStaff)`.

---

## Transactional Email System

Provider abstraction (`EmailProvider`) supporting **Resend** with a mock console fallback for testing:
- **Welcome Email**: Onboarding confirmation with POS counter link.
- **Trial Ending Reminder**: Friendly notice 3 days before trial conclusion with payment link.
- **Payment Received**: Branded receipt with invoice number, amount in BDT, renewal period, and billing link.
- **Payment Failed**: Alert notifying merchant of the 7-day grace period and payment update link.

---

## Environment Variables

Copy `.env.example` to `.env.local` to configure sandbox credentials:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_CURRENCY=BDT
NEXT_PUBLIC_DEFAULT_TIMEZONE=Asia/Dhaka

# SSLCommerz Sandbox
SSLCOMMERZ_STORE_ID=dokani_test
SSLCOMMERZ_STORE_PASSWD=dokani_pass
SSLCOMMERZ_IS_LIVE=false

# bKash Tokenized Sandbox
BKASH_APP_KEY=bkash_sandbox_key
BKASH_APP_SECRET=bkash_sandbox_secret
BKASH_USERNAME=sandbox_user
BKASH_PASSWORD=sandbox_pass
BKASH_IS_LIVE=false

# Transactional Email (Resend)
RESEND_API_KEY=re_mock_test_key_for_development
EMAIL_FROM=Dokani Billing <billing@dokani.app>
```

---

## Testing & Quality Assurance

Run the test suite, TypeScript compiler, and ESLint:

```bash
# Run unit, integration, and benchmark tests (196 tests across 28 test suites)
npm test

# Verify strict TypeScript type compliance (zero errors)
npm run typecheck

# Verify ESLint rules
npm run lint
```
