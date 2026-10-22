# Contributing to Dokani POS SaaS

Thank you for your interest in contributing to Dokani! We welcome contributions from developers worldwide to build the most resilient retail operating system for emerging markets.

---

## 1. Quickstart Development Setup

Follow these steps to run Dokani locally in under 5 minutes:

```bash
# 1. Clone your fork of the repository
git clone https://github.com/Muntasir247/dokani.git
cd dokani

# 2. Install exact dependencies
npm ci

# 3. Configure environment variables
cp .env.example .env.local

# 4. Start local development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the application.

---

## 2. Development Workflow & Git Standards

### Branch Naming Conventions
- `feat/<feature-name>`: New capabilities or functional enhancements.
- `fix/<bug-description>`: Bug fixes and error resolutions.
- `perf/<optimization>`: Performance tuning or latency improvements.
- `test/<suite-name>`: Additional test coverage or benchmark scripts.
- `docs/<topic>`: Documentation, architecture updates, or guides.

### Commit Messages (Conventional Commits)
Write commit messages following the Conventional Commits specification:
```
feat(courier): add steadfast status webhook sync to sales ledger
fix(pos): resolve rounding variance in fractional poisha split payments
perf(dashboard): add composite index on daily_sales_aggregates
test(sync): verify uuid v7 monotonicity under rapid burst creation
```

---

## 3. Pre-Flight Verification Checklist

Before submitting any Pull Request, ensure that all verification commands pass locally:

```bash
# 1. Static linting (ESLint 9)
npm run lint

# 2. TypeScript compilation check
npm run typecheck

# 3. Comprehensive test suite (Vitest)
npm test

# 4. Playwright End-to-End verification
npm run test:e2e
```

---

## 4. Architectural Rules & Best Practices

1. **Never Trust Client Prices or Totals**: All monetary computations, discounts, and inventory balances must be validated server-side in transactional RPCs.
2. **Never Log PII or Secrets**: Use `logger.info()` from `@/lib/observability/logger` which automatically scrubs Bangladesh phone numbers, emails, passwords, and tokens.
3. **Double-Entry Stock Ledger**: Do not write `UPDATE products SET stock = ...`. All inventory adjustments must be recorded as rows in `stock_movements`.
4. **Row Level Security (RLS)**: Every new table created in a migration must have `ENABLE ROW LEVEL SECURITY` and explicit tenant policies defined.
