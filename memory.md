# Outlay — Project Memory

> Working memory for this repo. Read this at the start of a session for context;
> append a dated entry after completing significant work. See the `repo-memory` skill.

## Snapshot

- **App:** Outlay — a collaborative household expense‑tracking **PWA** (formerly "HomeExpense").
- **Repo:** `github.com/mangatinanda/outlay` (renamed from `home-expense`). Local: `/Users/nanda/vibe-code/outlay`.
- **Package manager:** pnpm. **Branch:** `main`.
- **Dev:** `pnpm dev` → http://localhost:3000. Local passcode: `home123`.

## Stack

Next.js 16.2.7 (App Router, React 19.2, Server Components + Server Actions, Turbopack) ·
TypeScript 6 · Tailwind v4 + shadcn/ui on **Base UI 1.5** · **Turso/libSQL** (`@libsql/client`)
+ Drizzle ORM (`sqlite-core`) · Zod 4 · Recharts 3 · `@serwist/turbopack` PWA ·
**next-auth v5** (`5.0.0-beta.31`, Google — Model A) · date-fns 4 · cuid2. ESLint held at **9**
(Next's bundled eslint plugins cap at 9; do not bump to 10).

## Architecture & conventions

- **Reads** → `src/lib/queries/*` in Server Components. **Writes** → `src/lib/actions/*` Server
  Actions (Zod‑validate → Drizzle → `revalidatePath`). No REST API except `/api/auth/*` (Auth.js)
  and the Serwist SW route `/serwist/[path]`.
- **Auth (two coexisting paths):**
  - **Passcode gate** — `src/proxy.ts` (Next 16 "proxy", the renamed middleware; Node runtime).
    Verifies a Web Crypto HMAC cookie `he_session` (`src/lib/gate.ts`, signed with `AUTH_SECRET`).
    Passcode value in `HOUSEHOLD_PASSCODE`.
  - **Google (Auth.js v5)** — `src/auth.ts` (Google provider, **JWT** sessions, **allow‑list**
    `signIn` callback via `HOUSEHOLD_ALLOWED_EMAILS`). `proxy.ts` grants access on a Google session
    **OR** a valid passcode. (Model A = identity layer; households stay shared. Model B = user‑owned,
    documented for later — would REPLACE the passcode.)
- **Multi‑household ("workspaces"):** the active household is the `he_household` cookie, resolved by
  `getCurrentHousehold()` (`src/lib/queries/household-queries.ts`), falling back to the first. All data
  (members, categories, expenses, currency) is scoped by `household_id`, so switching isolates data.
  Manage via the sidebar switcher + `/households`.
- **Currency:** per‑household (`households.currency`), **default INR** (en‑IN grouping). `CurrencyProvider`
  + `useFormatCurrency()`; changed via the Settings switcher (`updateHouseholdCurrency`). Reformat‑only,
  no FX conversion.
- **DB:** one libSQL driver for both worlds — `file:./data/expense.db` (dev, gitignored) and
  `libsql://…`+token (prod). Drizzle migrations in `drizzle/`; `pnpm db:migrate` + `pnpm db:seed`
  (no auto‑seed). DB‑backed pages export `dynamic = "force-dynamic"` (via the `(app)` layout) so the
  **build needs no database**.
- **PWA:** `@serwist/turbopack` (NOT `@serwist/next` — that needs webpack). SW served at `/serwist/sw.js`
  via `src/app/serwist/[path]/route.ts`; `/~offline` fallback; `SerwistProvider` in the root layout.
- **Plans** live in `plans/`; design specs in `docs/superpowers/specs/`.

## Work log

### 2026‑06‑12 (later) — Audit complete: 1.5, 1.6, all of milestone 3 + Claude Code config

- **1.5:** failed passcode attempts log + pay a constant ~1s delay (`FAILED_ATTEMPT_DELAY_MS`).
- **1.6:** `overrides: postcss >=8.5.10` in `pnpm-workspace.yaml` (needed `pnpm dedupe` —
  plain `pnpm install` short‑circuits and doesn't apply new overrides). `pnpm audit --prod` clean.
- **3.1:** five indexes (expenses household+date / category / member; categories household;
  household_members household) — `drizzle/0002_strong_sphinx.sql`, applied to dev DB.
- **3.4:** `createHousehold` seeds household+member+categories in one atomic `db.batch`.
- **3.5/3.6:** removed `maximumScale: 1` (WCAG pinch‑zoom) and the dead Bell button;
  `getSpendingByDay` zero‑fills the 31‑day window; "This Month" card shows "No spending
  recorded last month" instead of a bogus 0%; seeder uses local dates (`en-CA`), not UTC.
- **3.2 dead code:** deleted `hooks/use-mobile.ts`, `ui/input-group.tsx`, the unused
  `CurrencyDisplay` component (kept `formatCurrency`). **Decisions:** KEEP the unused
  `getExpenses` filters param (roadmap: filter UI) and the dead `users` table +
  `household_members.user_id` (Model B will need them).
- **CI:** checkout/setup-node bumped to v5 + `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` (Node‑20
  action runtimes die Sept 2026).
- **Claude Code standards check** (via claude-code-guide agent against current docs): repo
  already matches 2026 baseline (root + nested CLAUDE.md, project skill, committed memory.md);
  added the one gap — committed `.claude/settings.json` (permissions allowlist for
  lint/test/build/tsc/db + read‑deny for `.env.local` and `data/`). Optional next steps noted
  in the audit doc: `.claude/agents/`, `.mcp.json`, claude-code-action PR review (v1.0.94+).
- Tests now **53**. The audit (`docs/2026-06-11-repo-audit.md`) is fully executed: M0–M3 done.

### 2026‑06‑12 — Audit milestone 2 (committed + pushed)

- **2.4 perf:** `getCurrentHousehold`/`listHouseholds` wrapped in React `cache()` (one DB
  round‑trip per request); `(app)/layout.tsx` fetches household/list/session via `Promise.all`.
- **2.2 error envelope:** all CRUD actions wrapped in `safeAction` (`lib/actions/safe-action.ts`)
  — throws are `console.error`‑logged and returned as `{error}`; `unstable_rethrow` keeps
  `redirect()` working (`verifyPasscode`); `logout` stays unwrapped (bare `<form action>` needs
  `Promise<void>`).
- **2.1 money → integer minor units:** `expenses.amount` (REAL) → `amount_minor` (INTEGER,
  fixed scale 100; `lib/money.ts`). Queries convert back with one `/100.0` so components are
  untouched. Migration `drizzle/0001_money_minor_units.sql` was **hand‑written** (table
  recreate + `CAST(ROUND(amount*100) AS INTEGER)`) because `drizzle-kit generate` needs an
  interactive rename prompt; snapshot/journal authored by hand — `pnpm db:generate` confirms
  no drift. Local dev DB migrated losslessly (15 rows, 2328.27 → 232827).
- **2.3 docs reconciliation:** CLAUDE.md (auth real, Next 16, conventions), src/lib/CLAUDE.md
  (libSQL, safeAction/scoping pattern, tests), README (status, features, ER diagram, gate
  format, API reference incl. household actions, env vars, roadmap → Model B). Removed the
  settings page's disabled "Google coming soon" card; fixed the member‑delete dialog copy.
- Tests now 49 (added money, dashboard‑exactness, safe‑action suites).

### 2026‑06‑11 — Repo audit + top‑5 hardening pass

**Full audit** written to `docs/2026-06-11-repo-audit.md` (graded B‑; findings cite file:line as of
`d39655c`). Then implemented the top‑5 high‑leverage tasks, TDD (41 tests, all green):

- **Tests + CI:** Vitest 4 (`vitest.config.ts`, `pnpm test`) — unit tests for `gate.ts`,
  `allow-list.ts`, `expense-schema`; integration tests (`src/lib/actions/scoping.test.ts`) against
  an in‑memory libSQL DB with real migrations (next/headers + next/cache mocked). GitHub Actions CI
  (`.github/workflows/ci.yml`): lint → tsc → test → build (build uses a dummy `AUTH_SECRET`; needs
  no DB).
- **Fail‑closed Google allow‑list:** new `src/lib/allow-list.ts` (`isEmailAllowed`); in production
  an EMPTY `HOUSEHOLD_ALLOWED_EMAILS` now denies all sign‑ins (dev stays open). `src/auth.ts` uses it.
- **Expiring passcode sessions:** `he_session` token format is now `v1.<issued-at>.<HMAC sig>`
  with server‑side 30‑day expiry (`SESSION_MAX_AGE_SECONDS` in `gate.ts`); legacy constant tokens
  are rejected — everyone re‑enters the passcode once. Bump `SESSION_VERSION` to mass‑invalidate.
- **Household‑scoped mutations:** all update/delete actions now filter by the active household and
  return `{error}` on foreign ids (checked via `.returning()`); `createExpense`/`updateExpense`
  verify categoryId/memberId belong to the household (`checkOwnership`); `getExpenseById(id,
  householdId)` is scoped and the edit page 404s on foreign expenses; `deleteCategory`'s
  accidental‑boolean guard rewritten (`select({id}).limit(1)`); rename/deleteHousehold check
  existence; expense‑list now surfaces delete errors.
- **Validators tightened:** `date` → `z.iso.date()` (real YYYY‑MM‑DD; column is compared
  lexicographically), `amount` → positive, ≤ 100M, ≤ 2 decimal places (epsilon for float noise).
- **Tooling:** pnpm 11 store migration forced a fresh `node_modules`; build‑script allowlist moved
  from `package.json#pnpm` (ignored by pnpm 11) to `pnpm-workspace.yaml` `allowBuilds`.

### 2026‑06‑05 → 06‑10 (previous session)

**Made the app deployable + a major hardening/feature pass, then renamed it to Outlay.**

- **Cleanup:** removed leftover create‑next‑app SVGs; real README; fixed lint.
- **Deployable serverless PWA** (`docs/superpowers/specs/2026-06-05-deployable-serverless-pwa-design.md`):
  better‑sqlite3 → **Turso/libSQL**; real migrations + seed (killed per‑request `ensureSeeded`);
  **passcode gate** (`proxy.ts` + Web Crypto HMAC, no JWT lib); **PWA** via `@serwist/turbopack`;
  fixed the `deleteMember` orphan bug.
- **Base UI fixes:** `MenuGroupRootContext` crash (a `DropdownMenuLabel` needs a `DropdownMenuGroup`
  wrapper); `nativeButton={false}` required when a shadcn `Button` renders a `<Link>`.
- **Dependency upgrade → latest stable:** next 16.2.7, recharts 3, react‑day‑picker 10, TS 6,
  @base-ui/react 1.5, zod 4.4, @types/node 25 (eslint kept at 9). Regenerated `chart.tsx` for recharts 3;
  fixed `calendar.tsx` (`table`→`month_grid`).
- **Repo audit** (multi‑agent, 25 real / 12 false positives) → `force-dynamic` on DB pages, surfaced
  `deleteMember` error in the UI, expense‑form local date (was UTC), `shadcn` → devDependencies.
- **Dead‑code removal:** 9 unused `ui/` primitives (calendar, chart, command, popover, scroll-area,
  separator, switch, table, tabs) + dead deps (next-auth, cmdk, react-day-picker — all re‑addable).
- **README:** Principal‑Tech‑Writer rewrite (4 Mermaid diagrams + Server‑Actions API reference).
- **Currency switcher** (`plans/2026-06-07-currency-switcher.md`): per‑household, default INR.
- **Multi‑household workspaces** (`plans/2026-06-07-household-ui-multi-workspace.md`):
  `getDefaultHousehold` → `getCurrentHousehold` (cookie), 12 sites rethreaded; create/rename/
  delete(cascade)/switch actions; sidebar switcher + `/households`; per‑household isolation verified.
- **Mobile drawer fix:** the desktop‑only `Sidebar` (`hidden md:flex`) was reused in the mobile Sheet →
  empty drawer; added an `inSheet` variant (root‑caused via browser repro).
- **Rename HomeExpense → Outlay:** code/UI/manifest/README/package + **GitHub repo renamed**
  (`home-expense` → `outlay`). User renamed the local folder to `outlay` too.
- **Google login (Model A)** (`plans/2026-06-09-google-login.md`): research concluded **stay on Turso**
  (Postgres not needed). Implemented Auth.js v5 + Google (JWT, allow‑list), route handler, `proxy.ts`
  coexistence, login Google button, `logout()` action, header user display, env vars; removed the mock
  `lib/auth.ts`. Verified wiring (passcode still works, providers/csrf endpoints, login UI).

**Commits pushed:** `d98f2d3` (Turso PWA + dep upgrade + currency), `c6c682b` (multi‑household + mobile
fix + Outlay rename), `9f35685` (Google login plan + CLAUDE.md fixes). Earlier reconciled a remote README
commit (`5b56777`) by rebasing and keeping the comprehensive README.

## Key decisions

- **Stay on Turso/libSQL** — Postgres not required to add auth; revisit only on a real scale/relational trigger.
- **Auth = Model A now** (Google identity + allow‑list, households stay shared) with the **passcode kept**.
  Model B (user‑owned households, per‑user scoping) is the documented future — and going to B means
  **dropping the passcode** (coexisting passcode + per‑user permissions is a foot‑gun).
- **Default currency INR.**
- **Deployed 2026‑06‑12** under the `mangatinanda` Vercel account (project
  `nanda-kumar-mangatis-projects/outlay`, **git‑connected** → pushes to `main` auto‑deploy).
  Production: **https://myoutlay.vercel.app** (primary; `outlay-kappa.vercel.app` also works).
  `outlay.mangatinanda.me` is attached to the project but pending a CNAME
  (`outlay` → `cname.vercel-dns.com`) at the registrar (IONOS nameservers).
  Turso DB `outlay` (aws‑ap‑south‑1).

## Current state & open items

- **The 2026‑06‑11 audit is fully executed (M0–M3 + quick wins); CI green; audit clean.**
- **DEPLOYED to production** (2026‑06‑12): https://outlay-kappa.vercel.app — Turso migrated
  (all 3 migrations + indexes verified), 4 env vars set in Vercel (DATABASE_URL,
  TURSO_AUTH_TOKEN, AUTH_SECRET, HOUSEHOLD_PASSCODE — all freshly generated; passcode is in
  Vercel env + `/tmp/outlay-passcode.txt` locally, NOT in the repo). Browser‑verified E2E:
  passcode login → dashboard (Turso reads), created "My Home" (INR) via UI (atomic batch
  write), zero console errors. No sample seed in prod (real household made via UI).
- **Google sign‑in ENABLED in prod (2026‑06‑13):** OAuth client created (redirect URIs for
  myoutlay.vercel.app, outlay-kappa.vercel.app, and localhost:3000); `AUTH_GOOGLE_ID` /
  `AUTH_GOOGLE_SECRET` / `HOUSEHOLD_ALLOWED_EMAILS` (3 family Gmails) set in Vercel production.
  Verified live: the Google button reaches Google's sign‑in for myoutlay.vercel.app with the
  correct client + callback. NOTE: the consent screen is in "Testing" mode — family members
  must be added as test users in Google Cloud Console (or publish the app). For local dev,
  the same three vars go in `.env.local`.
- Deliberately kept: `getExpenses` filters param (roadmap filter UI) and the `users` table
  (Model B). Optional future: filter UI, `.claude/agents/`, claude-code-action PR review.
- **To finish Google login:** user must create a Google Cloud OAuth client (redirect URI
  `http://localhost:3000/api/auth/callback/google`) and set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` /
  `HOUSEHOLD_ALLOWED_EMAILS` in `.env.local`, then restart. Browser end‑to‑end test still owed.
- **Deploy** (Turso provision → Vercel env → migrate+seed → `vercel --prod`) is queued.
- Stray empty `/Users/nanda/vibe-code/home-expense/.next` left over from the folder rename (harmless;
  can be deleted).

## Commands

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm test` (vitest) · `pnpm exec tsc --noEmit` ·
`pnpm db:migrate` · `pnpm db:seed` · `pnpm db:init` (migrate + seed).
