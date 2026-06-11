# Outlay — Repository Audit & Improvement Plan

> **Audited:** 2026-06-11 at commit `d39655c` (branch `main`, clean tree).
> Verification: `pnpm lint` ✅ clean · `pnpm exec tsc --noEmit` ✅ clean · `pnpm audit --prod` → 1 moderate CVE.
> Every finding cites `file:line` as of the audited commit. *(F)* = verified fact, *(J)* = judgment.

---

## Executive Summary

**Overall health: B-.** A well-architected, disciplined hobby project — strict TypeScript that
compiles clean, consistent layering (queries/actions/validators), no committed secrets, top-of-tree
dependencies — undermined by three things: **zero tests and zero CI**, **auth defaults that fail
open**, and **mutations that don't enforce the household boundary**. Timing matters: deployment to
the public internet is queued (memory.md), which converts several "fine on localhost" findings into
real exposure.

**Top 3 risks**

1. If `HOUSEHOLD_ALLOWED_EMAILS` is unset in production, *any Google account* gets full
   read/write/delete access to the family's financial data (`src/auth.ts:17`) — one forgotten env
   var, failing silently.
2. The passcode session cookie is an HMAC of a constant string with no expiry — identical for every
   user, valid forever, unrevocable except by rotating `AUTH_SECRET` (`src/lib/gate.ts:8,47-49`).
3. With no tests and no CI, a codebase that already shipped late-caught bugs (the `deleteMember`
   orphan bug, the mobile drawer bug — both in memory.md) has no safety net for its aggressive
   refactor cadence.

**Top 3 opportunities:** (1) a half-day CI + unit-test pass over the money math and the gate locks
in the current quality; (2) scoping all mutations by household is the single change that unblocks
the documented Model B future; (3) migrating money from `real` to integer minor units is cheap
*now* (one user, one local DB) and painful later.

---

## Repo Map

**Purpose:** Outlay — a collaborative household expense-tracking PWA for family members sharing one
or more households. Personal/family product, single developer, AI-assisted workflow (CLAUDE.md
files, `plans/`, `memory.md` are load-bearing).

**Maturity:** functional prototype on the cusp of first production deployment. Scaffolded
2026-03-18; one big feature commit; then an intense 2026-06-05→11 hardening sprint (Turso
migration, PWA, multi-household, Google auth).

**Stack:** Next.js 16.2.7 (App Router, Turbopack, React 19.2) · TypeScript 6 strict · Tailwind v4 +
shadcn/ui on Base UI · Turso/libSQL + Drizzle ORM · Zod 4 · Auth.js v5 beta (Google, JWT) + custom
HMAC passcode gate · Serwist PWA · pnpm. ~5,000 lines of TS/TSX; largest hand-written file is 221
lines — no god files.

**Architecture (verified, matches docs):**

```
Browser/PWA → src/proxy.ts (Next 16 "proxy": Google session OR passcode cookie)
  reads:  Server Components → src/lib/queries/*  → Drizzle → libSQL
  writes: Client forms → src/lib/actions/* (Zod → Drizzle → revalidatePath)
  auth:   src/auth.ts (Auth.js v5) + src/lib/gate.ts (Web Crypto HMAC cookie)
  active household: `he_household` cookie → getCurrentHousehold()
```

**Key directories:** `src/app/(app)/` six authenticated pages · `src/app/(auth)/login` dual-auth
login · `src/lib/{db,queries,actions,validators}` the entire backend ·
`src/components/{ui,layout,dashboard,expenses,…}` · `drizzle/` one migration · `plans/`,
`docs/superpowers/specs/`, `memory.md` design history.

**Surprises:** (a) documentation contradicts the code in four places — CLAUDE.md says auth is
mocked; it shipped. (b) a `users` table exists that nothing writes to (JWT strategy, no adapter).
(c) `getExpenses` accepts a rich filter object no caller uses, while the README advertises
filtering as a feature. (d) `memory.md` was stale on its top open item (said Model A uncommitted;
it's commit `22815b5`).

---

## Audit Report

### Security

| # | Finding | Where | Severity |
|---|---------|-------|----------|
| S1 | Google allow-list **fails open**: empty/unset `HOUSEHOLD_ALLOWED_EMAILS` ⇒ `signIn` returns `true` for any Google account. One missed env var on deploy opens the app — including `deleteHousehold` — to any Google account, silently. *(F)* | `src/auth.ts:12-18` | **Critical** |
| S2 | Passcode session token is **constant, eternal, shared**: cookie = `HMAC(AUTH_SECRET, "authed")` — identical for every device, no expiry/nonce/version in the payload. The 30-day `maxAge` is browser-side only; a leaked value verifies forever. `logout()` revokes nothing. *(F)* | `src/lib/gate.ts:8,47-49`, `auth-actions.ts:30,37-41` | **High** |
| S3 | No rate limiting on the passcode endpoint; dev passcode is `home123`. Brute-forceable once internet-exposed. *(F/J)* | `src/lib/actions/auth-actions.ts:10-34` | Medium |
| S4 | **Mutations don't verify household ownership**: every id-parameterized update/delete operates on the raw id (`updateExpense`/`deleteExpense` expense-actions.ts:60-71,79; `updateCategory`/`deleteCategory` category-actions.ts:51-58,76; `updateMember`/`deleteMember` member-actions.ts:48-54,73; `renameHousehold`/`deleteHousehold` household-actions.ts:80,92-97). `createExpense` (expense-actions.ts:29-38) inserts foreign `categoryId`/`memberId` unchecked → cross-household data corruption; structural blocker for Model B. *(F)* | action files | Medium (High under Model B) |
| S5 | `getExpenseById` unscoped; the edit page renders a foreign expense against the *current* household's categories/members — saving silently reassigns it. *(F)* | `expense-queries.ts:52-73`, `expenses/[id]/edit/page.tsx:17-26` | Medium |
| S6 | Supply-chain hygiene half-applied: `pnpm.onlyBuiltDependencies` in package.json:36-42 is **ignored** by the installed pnpm (warning on every command); `.npmrc:1` sets `enable-pre-post-scripts=true`; `pnpm audit --prod` → postcss <8.5.10 XSS (GHSA-qx2v-qp2m-jg93) via `next>postcss` and `next-auth>next` (next-auth pulls a second Next copy). *(F)* | package.json, .npmrc | Low-Medium |

Healthy: no secrets in git (only `.env.example` tracked); cookies `httpOnly`/`secure`/`lax`; all
writes parameterized via Drizzle; Zod on every mutation; constant-time comparisons.

### Testing

| # | Finding | Where | Severity |
|---|---------|-------|----------|
| T1 | **Zero tests, zero CI**: no test files, no test script, no framework, no `.github/`. Only nets are `tsc`/ESLint run by hand. The repo's own work log records three late-caught bugs. Highest-value untested surfaces: `gate.ts`, dashboard money math (`monthChange` zero-baseline, dashboard-queries.ts:48-50), action guards. *(F)* | repo-wide | **High** |

### Code quality

| # | Finding | Where | Severity |
|---|---------|-------|----------|
| Q1 | **No try/catch in any action** (grep: 0 per file). A Turso network failure propagates as an unhandled rejection; clients only check `result.error` → silent stuck failure. The documented `{error}` contract is half-implemented. *(F)* | all `src/lib/actions/*` | Medium |
| Q2 | `deleteCategory` guard works by accident: `select({count: eq(...)})` projects a SQL boolean (not a count) and fetches every matching row to answer yes/no; correct idiom is 30 lines away in member-actions.ts:63-67. *(F)* | `category-actions.ts:67-70` | Low |
| Q3 | Dead code (verified by grep): `users` table (schema.ts:3-11, never written), `getExpenses` filters param (sole caller passes none), `CurrencyDisplay` component, `src/hooks/use-mobile.ts`, `ui/input-group.tsx` (158 lines), duplicated `GoogleIcon` (login + settings pages). *(F)* | various | Low |
| Q4 | Contradictory UX copy: member-delete dialog promises "expense history will be preserved" while the server refuses exactly that deletion. *(F)* | member-manager.tsx:201 vs member-actions.ts:69-71 | Low |

### Correctness / data integrity

| # | Finding | Where | Severity |
|---|---------|-------|----------|
| D1 | **Money is IEEE-754 floating point** (`real`), summed in SQL; validator has no upper bound and no decimal limit — `"1e308"` / `"Infinity"` coerce and pass `.positive()`, poisoning every aggregate. *(F)* | schema.ts:63, expense-schema.ts:4 | Medium |
| D2 | `date` column is free text validated only as non-empty, but drives *lexicographic* range filters, grouping, and `parseISO→format` rendering (throws on garbage → page crash). The seeder itself has the UTC variant of this bug class (seed.ts:76). *(F)* | expense-schema.ts:8, dashboard-queries.ts:19-25, expense-list.tsx:61 | Medium |
| D3 | `createHousehold` is non-atomic (1+1+N sequential inserts) while `deleteHousehold` correctly uses `db.batch` — same file, two standards. *(F)* | household-actions.ts:52-69 vs 92-97 | Low |

### Performance

| # | Finding | Where | Severity |
|---|---------|-------|----------|
| P1 | `getCurrentHousehold` re-executed per call site, no React `cache()`; layout awaits 3 queries sequentially, then every page re-queries — 3-4 serial Turso round-trips before content. *(F)* | household-queries.ts, (app)/layout.tsx:19-21 | Low-Medium |
| P2 | No secondary indexes (only `users_email_unique`); every dashboard query scans expenses on `(household_id, date)`. Irrelevant at family scale; one line to fix. *(F/J)* | drizzle/0000:55 | Low |

Healthy: no N+1s; dashboard parallelizes with `Promise.all`; Suspense skeletons everywhere.

### Dependencies

Current and clean (Next 16.2.7, React 19.2.7, Zod 4, Tailwind 4 top-of-tree; lockfile consistent).
Flags: `next-auth` pinned beta (`5.0.0-beta.31` — acceptable, v5 stable hasn't shipped), the
postcss CVE and dead pnpm config block (see S6).

### DevEx & operations

| # | Finding | Where | Severity |
|---|---------|-------|----------|
| O1 | No CI/CD; deploy is a manual checklist in memory.md. *(F)* | repo-wide | High (with T1) |
| O2 | No observability: only `console.*` in src is the seeder. Combined with Q1, production failures are invisible. `console.error` in a catch-wrapper would surface in `vercel logs` for free. *(F/J)* | repo-wide | Medium |

### Documentation

| # | Finding | Where | Severity |
|---|---------|-------|----------|
| Doc1 | CLAUDE.md says auth is mocked/disabled and "Next.js 15" — Google auth shipped, `lib/auth.ts` deleted, stack is Next 16. Load-bearing for agent sessions. *(F)* | CLAUDE.md:4, Auth Status section | Medium |
| Doc2 | src/lib/CLAUDE.md describes the previous database ("better-sqlite3 with WAL", nonexistent `db/init.ts`). *(F)* | src/lib/CLAUDE.md:4,7 | Medium |
| Doc3 | README says single-household ("multi-household deferred"), references deleted `lib/auth.ts`, claims a filter feature that has no UI; settings page still shows a **disabled** "Google coming soon" card while Google login is live. *(F)* | README.md:7-8,249; settings/page.tsx:61-67 | Low-Medium |

Misc low: `viewport.maximumScale: 1` disables pinch-zoom (WCAG 1.4.4) — app/layout.tsx:38; Bell
button is decorative (header.tsx:53-55); `getSpendingByDay` doesn't zero-fill days; `monthChange`
shows `0%` when the previous month had no baseline.

### Strengths (preserve these)

1. **Architecture discipline:** reads-via-queries / writes-via-validated-actions followed
   everywhere — no page imports `db`, no mutation skips Zod.
2. **Type & lint cleanliness:** strict `tsc` and ESLint pass with zero output.
3. **Security fundamentals that exist are right:** Web Crypto HMAC, constant-time comparison,
   correct cookie flags, parameterized queries, clean git history.
4. **Deployability thinking:** `force-dynamic` so builds need no DB ((app)/layout.tsx:12).
5. **Decision hygiene:** plans/, specs/, memory.md record *why* (stay on Turso, Model A vs B).
6. **UX care:** optimistic currency switch with revert, confirm dialogs, skeletons, mobile nav.

---

## Improvement Strategy

**Theme 1 — The trust boundary is one env var deep** (S1, S2, S3, S4, S5). Root cause: the server
trusts configuration and clients instead of enforcing invariants. Target: fail-closed auth,
self-expiring versioned tokens, every mutation scoped to the active household in the SQL `where`.
*Principle: authorization lives in the data layer, not the deploy checklist.*

**Theme 2 — No safety net under an aggressive refactor cadence** (T1, O1). Target: CI running
lint + typecheck + build + tests; unit tests over the gate, money math, and action guards.
*Principle: codify the checks already run by hand; no ceremony beyond them.*

**Theme 3 — Money and dates are correct by convention, not construction** (D1, D2, Q1). Target:
integer minor units; ISO-validated dates and bounded 2-decimal amounts at the Zod boundary.
*Principle: make invalid states unrepresentable while the dataset is still trivially migratable.*

**Theme 4 — Documentation drifts faster than code** (Doc1-3). Target: durable rules in CLAUDE.md
only, evolving state in memory.md only, README claims match `git grep`; doc updates ship in the
same commit as behavior changes. *Principle: a wrong doc is worse than no doc, doubly so when
agents read it as ground truth.*

**Explicitly NOT recommended:** Postgres / Auth.js DB adapter (stay-on-Turso decision is right);
an e2e suite (unit + hand-testing is the right cost/benefit pre-Model-B); rate-limit infrastructure
(constant-time failure delay + strong passcode is proportionate); observability platforms
(`console.error` → `vercel logs` suffices); building the filter UI (product choice, not debt).

**Definition of done:** prod refuses to authenticate with an empty allow-list and rejects
forged/expired cookies (proven by tests); CI green required to merge; `gate.ts`, dashboard math,
and action guards fully covered; no doc claim contradicted by code; amounts stored as integers;
`pnpm audit --prod` clean.

---

## Task Plan

### Milestone 0 — Safety net

| # | Task | Files | Acceptance | Effort | Risk | Deps |
|---|------|-------|-----------|--------|------|------|
| 0.1 | CI: lint, `tsc --noEmit`, build, test on push/PR | `.github/workflows/ci.yml` | type error fails CI | S | none | — |
| 0.2 | Vitest + unit tests: gate (roundtrip/tamper/expiry), validators (garbage date, Infinity, >2dp), dashboard math | `vitest.config.ts`, `src/**/*.test.ts` | tests run in CI; new-behavior tests fail until M1 lands (TDD) | M | none | 0.1 |
| 0.3 | Action-guard tests vs temp libSQL DB (migrate + fixtures): delete guards, last-household rule, createExpense | `src/lib/actions/*.test.ts` | guards covered incl. Q2 path | M | low | 0.2 |

### Milestone 1 — Critical & correctness

| # | Task | Files | Acceptance | Effort | Risk | Deps |
|---|------|-------|-----------|--------|------|------|
| 1.1 | **Fail-closed allow-list**: prod + empty list ⇒ deny | `src/auth.ts` | test proves prod/deny, dev/allow | S | low | 0.2 |
| 1.2 | **Expiring versioned session**: payload `v1.<issuedAt>`, verify checks sig + age ≤ 30d | `gate.ts`, `auth-actions.ts` | old constant cookies rejected; 31d fails, 29d passes | S/M | med (invalidates sessions once) | 0.2 |
| 1.3 | **Tighten validators**: ISO date; amount finite, capped, ≤2dp | `expense-schema.ts` | 0.2's failing tests pass | S | low | 0.2 |
| 1.4 | **Household-scope every mutation** + ownership checks on create/update + scoped `getExpenseById` | 5 action files, expense-queries, edit page | foreign-id mutation returns `{error}`, changes nothing | M | med | 0.3 |
| 1.5 | Passcode failure damping (~1s constant delay + log) | auth-actions.ts | failed attempt ≥1s | S | low | — |
| 1.6 | Dep hygiene: postcss override ≥8.5.10; move `onlyBuiltDependencies` to pnpm-workspace.yaml; revisit `enable-pre-post-scripts` | package.json, .npmrc | audit clean; no pnpm warning | S | low | — |

### Milestone 2 — High leverage

| # | Task | Files | Acceptance | Effort | Risk |
|---|------|-------|-----------|--------|------|
| 2.1 | Money → integer minor units (migration ×100; convert at form/display boundary; mind JPY) | schema, migration, actions, queries, displays | totals exact; lossless migration | L | med-high |
| 2.2 | Uniform action error envelope: try/catch → `console.error` + `{error}` | all actions | simulated DB failure = toast + log, never unhandled | M | low |
| 2.3 | Docs reconciliation: CLAUDE.md auth + "15"; src/lib/CLAUDE.md db; README status/features; settings stale card; member-dialog copy; memory.md | docs + 2 components | no stale grep hits | M | none |
| 2.4 | React `cache()` for household queries; `Promise.all` layout | household-queries, (app)/layout | one household query/request | S | low |

### Milestone 3 — Polish

| # | Task | Effort |
|---|------|--------|
| 3.1 | Indexes: expenses(household_id,date), (category_id), (member_id), categories(household_id), household_members(household_id) | S |
| 3.2 | Dead-code sweep (use-mobile, input-group, CurrencyDisplay, GoogleIcon dupe); decide filters param + users table | S |
| 3.3 | Fix deleteCategory guard idiom (`select({id}).limit(1)`) | S |
| 3.4 | Batch + atomicize createHousehold | S |
| 3.5 | A11y/UX: drop maximumScale, Bell button, zero-fill chart, "no baseline" copy | S |
| 3.6 | Seeder local-date fix (same `en-CA` trick as expense-form.tsx:86) | S |

**Quick wins:** 1.1 · 1.3 · 1.5 · 1.6 · 2.4 · 3.3 · 3.6 (~half a day total; 1.1 alone removes the Critical).

### Open Questions (need a human decision)

1. **Model B timeline** — if per-user households come soon, 1.4 should go further (membership
   tables) rather than be done twice.
2. **Expense filters: build or delete?** README sells it, query supports it, no UI exists.
3. **`users` table: keep or drop?** Dead under JWT Model A; tied to question 1.
4. **Money migration approval (2.1)** — rewrites stored data; is JPY (0-decimal) actually needed?
5. **Deploy date** — Milestone 1 (at minimum 1.1, 1.2) should gate the deploy.
6. **Passcode longevity** — if Google sign-in suffices, retiring the passcode deletes the S2/S3
   surface entirely, cheaper than hardening it.

---

## Implementation status

**2026-06-11 — top-5 high-leverage tasks executed** (see memory.md work log for details):

1. ✅ 0.1 + 0.2 — Vitest + CI pipeline + unit tests (gate, allow-list, validators) + 0.3 action-guard integration tests
2. ✅ 1.1 — fail-closed allow-list (`src/lib/allow-list.ts` + `src/auth.ts`)
3. ✅ 1.2 — expiring versioned passcode sessions (`v1.<issuedAt>.<sig>`)
4. ✅ 1.4 — household-scoped mutations + ownership checks + scoped `getExpenseById` (includes 3.3)
5. ✅ 1.3 — validator tightening (ISO date, bounded ≤2dp amounts)

Remaining milestones (1.5, 1.6, M2, M3) are open.
