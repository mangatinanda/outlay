# Design — Make HomeExpense a Deployable Serverless PWA

**Date:** 2026-06-05
**Status:** Approved (pending spec review)
**Author:** Claude + Nanda

## 1. Goal

Take the working single-household HomeExpense demo and ship it as a **public, installable
PWA on Vercel**, backed by a **persistent cloud database (Turso/libSQL)** and protected by a
**shared passcode gate**. No new product features, no per-user accounts.

End state: a real URL, installable to a phone home screen, dashboard usable offline, data
persisted in Turso, casual visitors locked out by a passcode.

## 2. Locked Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database | **Turso / libSQL** | One driver (`drizzle-orm/libsql`) works for both local `file:` and cloud `libsql://`; existing `sqlite-core` schema is reused unchanged. |
| Access control | **Shared passcode gate** | Single-tenant app; stops public read/write without the cost of full OAuth. |
| Hosting | **Vercel** | Matches existing tooling; first-class Next.js 16 support. |
| Deploy | **Claude provisions Turso + deploys** | Final step performed end-to-end, not just left deploy-ready. |
| `deleteMember` bug | **Fixed in this work** | Folded in at user request. |
| Auth identity | **Mock identity retained** | The gate is not user auth; `getSession()` mock stays for display. |

## 3. Non-Goals (explicitly out of scope)

- Real Google OAuth / Auth.js user sessions / per-user accounts.
- Multi-household / multi-tenancy.
- New product features (budgets, recurring expenses, export, expense splitting, receipts).
- Full automated test suite + CI pipeline.
- Real multi-currency (currency stays the existing per-household `currency` column default).

## 4. Architecture Changes

### A. Database driver: better-sqlite3 → libSQL

**Current:** `src/lib/db/index.ts` uses `better-sqlite3` + `drizzle-orm/better-sqlite3`,
resolves a filesystem path, `mkdirSync`s the dir, and sets `journal_mode = WAL` /
`foreign_keys = ON` pragmas. None of this works on serverless (no writable persistent FS).

**Change:** Rewrite `index.ts` to use libSQL:
- `createClient({ url, authToken })` from `@libsql/client`, wrapped by `drizzle()` from
  `drizzle-orm/libsql`, keeping `{ schema }`.
- `url` from `process.env.DATABASE_URL` (local: `file:./data/expense.db`; prod:
  `libsql://<db>.turso.io`). `authToken` from `process.env.TURSO_AUTH_TOKEN` (undefined locally).
- Remove `path`/`fs`/`mkdirSync` logic and WAL/FK pragmas (libSQL/Turso enforce FKs server-side;
  the local seed/migrate step creates the `data/` dir).
- `src/lib/db/schema.ts` (`sqlite-core`) is **unchanged**.

**Dependencies:** add `@libsql/client`; remove `better-sqlite3` and `@types/better-sqlite3`.
Remove `serverExternalPackages: ["better-sqlite3"]` from `next.config.ts`.

### B. Migrations & seeding (replace per-request seeding)

**Current:** `src/lib/db/init.ts` runs raw `CREATE TABLE IF NOT EXISTS` SQL as a script, and
`(app)/layout.tsx` calls `ensureSeeded()` on **every request** (cold-start race on serverless;
also performs a DB read on every navigation).

**Change:**
- Generate real migrations with `drizzle-kit generate` from `schema.ts` into `./drizzle`.
  Update `drizzle.config.ts`: `dialect: "turso"`, `dbCredentials: { url, authToken }` from env.
- Apply with `drizzle-kit migrate` via a new `pnpm db:migrate` script.
- Delete `src/lib/db/init.ts` (superseded by generated migrations).
- Convert `src/lib/db/seed.ts` into a **standalone, manually-run, idempotent** seed
  (keeps its existing "skip if households non-empty" guard). Exposed as `pnpm db:seed`.
- **Remove `ensureSeeded()`** and the `seed` import from `(app)/layout.tsx`; the layout becomes
  a pure presentational layout.
- Rework `scripts/seed.ts` and `package.json` scripts: `db:migrate` (apply migrations),
  `db:seed` (seed data), and keep a convenience `db:init` = migrate + seed for local setup.

### C. Passcode access gate

The app's public URLs are `/dashboard`, `/expenses` (+ `/new`, `/[id]/edit`), `/categories`,
`/members`, `/settings`, plus `/` → redirect. All must require a passcode; `/login` and static
assets must not.

- **New `src/lib/gate.ts`**: `signSession()` / `verifySession()` using the **Web Crypto API**
  (`crypto.subtle` HMAC-SHA256, key = `AUTH_SECRET`). Edge-safe and Node-safe, so the same
  helper is used by both the middleware (Edge) and the Server Action (Node). No JWT library.
  The cookie value is `hmac(AUTH_SECRET, "authed")`; verification is a constant-time compare.
- **New `src/middleware.ts`** (Edge runtime): reads the `he_session` cookie and calls
  `verifySession()`. On failure, redirect to `/login`. `matcher` excludes `/login`, `/_next`,
  `/sw.js`, `/manifest.json`, icons, and other public assets.
- **New Server Action `src/lib/actions/auth-actions.ts`**: `verifyPasscode(formData)` —
  constant-time compare against `process.env.HOUSEHOLD_PASSCODE`; on success set an HttpOnly,
  `Secure`, `SameSite=Lax` `he_session` cookie (value from `signSession()`, `maxAge` controls
  session length) and redirect to `/dashboard`; on failure return `{ error }`.
- **Rewrite `(auth)/login/page.tsx`**: replace the disabled Google button with a passcode
  `<form>` driven by a small client component (`components/auth/passcode-form.tsx`) that calls
  `verifyPasscode` and shows validation errors via the existing inline/toast pattern. Drop the
  "Continue to App" bypass link.
- **Deferred (not in core):** a UI logout. Session length is governed by the cookie `maxAge`;
  a logout action + header entry point can be added later if needed. Keeps `header.tsx` untouched.

### D. PWA / offline (Serwist)

`@serwist/next` is already a dependency; the manifest + icons already exist; root-layout PWA
metadata is already present. Remaining work:
- Wrap `next.config.ts` with `withSerwistInit` from `@serwist/next`:
  `swSrc: "src/app/sw.ts"`, `swDest: "public/sw.js"`, plus an `additionalPrecacheEntries`
  entry for the offline fallback route.
- **New `src/app/sw.ts`**: `new Serwist({ precacheEntries: self.__SW_MANIFEST, skipWaiting: true,
  clientsClaim: true, navigationPreload: true, runtimeCaching: defaultCache })` using
  `defaultCache` from `@serwist/next/worker`; `serwist.addEventListeners()`.
- **New offline fallback page `src/app/~offline/page.tsx`** (precached) shown when navigation
  fails offline.
- Confirm `next-env`/TS picks up the worker file; add a minimal `tsconfig` include or `// @ts-nocheck`
  pattern only if the build requires it (Serwist provides `SerwistGlobalConfig` types).
- The service worker is **production-only** (disabled in `next dev`); verified via `pnpm build`.

### E. `deleteMember` orphan-records bug fix

**Current:** `deleteMember` (`member-actions.ts:60`) deletes unconditionally — a member with
existing expenses is removed, orphaning `expenses.member_id` (FK violation / dangling rows).
`deleteCategory` already guards against this; mirror that pattern.

**Change:** Before deleting, count `expenses` where `memberId === id`. If `> 0`, return
`{ error: "Cannot delete a member who still has expenses" }`. Otherwise delete and
`revalidatePath("/members")`. (Mirror the exact guard shape used in `category-actions.ts`.)

### F. Deploy to Vercel

1. Provision a Turso database (CLI), capture `DATABASE_URL` (`libsql://…`) + `TURSO_AUTH_TOKEN`.
2. Generate + apply migrations against Turso (`pnpm db:migrate`), then seed once (`pnpm db:seed`).
3. Create/link the Vercel project; set env vars (Production + Preview):
   `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `HOUSEHOLD_PASSCODE`.
4. Deploy (`vercel --prod`). Build command stays `next build` (migrations are applied out-of-band
   so build needs no DB write access).
5. Smoke-test the live URL (gate, dashboard, offline, installability).

## 5. New / Changed Files

| File | Change |
|---|---|
| `src/lib/db/index.ts` | Rewrite → libSQL client + `drizzle-orm/libsql` |
| `src/lib/db/init.ts` | **Delete** (replaced by migrations) |
| `src/lib/db/seed.ts` | Convert to standalone idempotent seed (remove runtime import) |
| `src/app/(app)/layout.tsx` | Remove `ensureSeeded()` + seed import |
| `drizzle.config.ts` | `dialect: "turso"`, env-driven credentials |
| `drizzle/` | **New** generated migration files |
| `scripts/seed.ts` | Rework into migrate/seed entry points |
| `package.json` | Scripts: `db:migrate`, `db:seed`, `db:init`; dep changes |
| `next.config.ts` | Wrap with `withSerwistInit`; drop `serverExternalPackages` |
| `src/app/sw.ts` | **New** Serwist service worker |
| `src/app/~offline/page.tsx` | **New** offline fallback page |
| `src/middleware.ts` | **New** passcode gate (Edge) |
| `src/lib/gate.ts` | **New** Web Crypto HMAC sign/verify helpers |
| `src/lib/actions/auth-actions.ts` | **New** `verifyPasscode` |
| `src/components/auth/passcode-form.tsx` | **New** client passcode form |
| `src/app/(auth)/login/page.tsx` | Rewrite → passcode form |
| `src/lib/actions/member-actions.ts` | Add `deleteMember` guard |
| `.env.example` | New vars (below) |
| `README.md` | Deploy/runbook section |

## 6. Environment Variables

```
# Local (.env.local)
DATABASE_URL=file:./data/expense.db
AUTH_SECRET=<openssl rand -base64 32>
HOUSEHOLD_PASSCODE=<your shared passcode>

# Production (Vercel)
DATABASE_URL=libsql://<db>-<org>.turso.io
TURSO_AUTH_TOKEN=<turso token>
AUTH_SECRET=<same-style secret>
HOUSEHOLD_PASSCODE=<your shared passcode>
```

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are removed from `.env.example` (OAuth is a
non-goal).

## 7. Dependencies

- **Add:** `@libsql/client`. (Gate uses the built-in Web Crypto API — no crypto library.)
- **Remove:** `better-sqlite3`, `@types/better-sqlite3`.
- **Already present (now used):** `@serwist/next`, plus `serwist` (add if not transitively available).

## 8. Verification Plan

- `pnpm lint` and `pnpm exec tsc --noEmit` clean.
- `pnpm build` succeeds and emits `public/sw.js`.
- Local: `pnpm db:init && pnpm dev` → app works against `file:` libSQL DB.
- Gate: unauthenticated request to `/dashboard` redirects to `/login`; correct passcode reaches
  the dashboard; wrong passcode shows an error.
- `deleteMember`: deleting a member with expenses is blocked with an error; deleting a member
  with none succeeds.
- Offline: after first load, going offline still serves the dashboard / `~offline` fallback.
- Installability: browser shows install prompt; manifest + icons valid.
- Production: live Vercel URL passes the same gate/offline/install checks against Turso data.

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Middleware can't use Node `crypto` | Use the Web Crypto API (`crypto.subtle`, Edge-safe) for HMAC sign/verify. |
| First deploy has empty DB | Run `db:migrate` + `db:seed` against Turso before the first prod deploy. |
| Serwist SW caching stale app shell | `skipWaiting` + `clientsClaim`; revision-based precache entry for `~offline`. |
| libSQL local `file:` URL needs `file:` prefix | `.env.example` uses `file:./data/expense.db` (not the bare path the old config used). |
| Secrets in repo | All secrets via env only; `.env.local` already gitignored. |

## 10. Sequencing

1. DB driver migration (A) + migrations/seeding (B) — foundation; verify locally.
2. `deleteMember` fix (E) — small, independent.
3. Passcode gate (C) — verify locally.
4. PWA/offline (D) — verify via `pnpm build`.
5. Provision Turso + deploy to Vercel (F) — final, performed by Claude.
