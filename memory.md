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

### 2026‑06‑05 → 06‑10 (this session)

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
- **Deploy deferred** — and will use a **different Vercel account** than the one currently logged in
  (`devikrupananda7-8095`); `vercel logout` → login as the other account first.

## Current state & open items

- **Model A code is implemented + verified but UNCOMMITTED.** Files: `src/auth.ts`, the `/api/auth`
  route, `proxy.ts`, login page, header, `(app)/layout.tsx`, `auth-actions.ts` (`logout`), env files,
  removed `lib/auth.ts`.
- **To finish Google login:** user must create a Google Cloud OAuth client (redirect URI
  `http://localhost:3000/api/auth/callback/google`) and set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` /
  `HOUSEHOLD_ALLOWED_EMAILS` in `.env.local`, then restart. Browser end‑to‑end test still owed.
- **Deploy** (Turso provision → Vercel env → migrate+seed → `vercel --prod`) is queued.
- Stray empty `/Users/nanda/vibe-code/home-expense/.next` left over from the folder rename (harmless;
  can be deleted).

## Commands

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm exec tsc --noEmit` · `pnpm db:migrate` · `pnpm db:seed` ·
`pnpm db:init` (migrate + seed).
