# Outlay - Household Expense Tracker

## Project Overview
A collaborative household expense tracking PWA built with Next.js 16, Turso/libSQL, and shadcn/ui. Designed for all family/home members to track shared expenses across multiple household workspaces.

## Tech Stack
- **Framework**: Next.js 16 (App Router, React 19, Server Components, Server Actions)
- **Language**: TypeScript 6 (strict mode)
- **Styling**: Tailwind CSS v4 + shadcn/ui (base-nova style, OKLCH colors)
- **Database**: Turso/libSQL via @libsql/client + Drizzle ORM (local SQLite file in dev, Turso cloud in prod — same driver)
- **Validation**: Zod v4
- **Charts**: Recharts
- **Auth (Model B — per-user households)**: `getCurrentActor()` (`src/lib/auth/actor.ts`) resolves each request to a **superadmin** (valid shared-passcode cookie, entered at `/admin` — bypasses scoping, sees all households) or a scoped **user** (Google/Auth.js v5 JWT carrying `session.user.id`). Google users see only households they're a member of (`household_members.user_id`); membership is enforced in `getCurrentHousehold`/`listHouseholds`/`switchHousehold` + `assertCanAccessHousehold` (`src/lib/auth/membership.ts`). Sign-in eligibility = allow-listed (`src/lib/allow-list.ts`, FAILS CLOSED in prod) OR has a membership/invite. Passcode HMAC cookie `he_session` (`src/lib/gate.ts`, `v2.<issued-at>.<sig>`, 30-day expiry); `proxy.ts` still grants entry on either a Google session or the passcode cookie. `/login` is Google-only.
- **PWA**: @serwist/turbopack service worker (served at `/serwist/sw.js`), manifest + icons, `/~offline` fallback
- **Testing**: Vitest (`pnpm test`) — unit + integration against in-memory libSQL; GitHub Actions CI runs lint/typecheck/test/build
- **Date Utils**: date-fns

## Architecture

### Directory Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/             # Auth pages (login = Google; admin = passcode/superadmin)
│   ├── (app)/              # Authenticated app pages
│   │   ├── dashboard/      # Main dashboard with charts
│   │   ├── expenses/       # CRUD expense pages
│   │   ├── categories/     # Category management
│   │   ├── members/        # Household member management
│   │   ├── settings/       # App settings
│   │   ├── settle-up/      # Settlement balances, split logic, minimal payments
│   │   └── activity/       # Append-only activity audit feed
│   └── layout.tsx          # Root layout with providers
├── components/
│   ├── ui/                 # shadcn/ui primitives (DO NOT edit manually)
│   ├── layout/             # Sidebar, header, mobile nav, theme toggle
│   ├── dashboard/          # Dashboard-specific components
│   ├── expenses/           # Expense-specific components
│   ├── categories/         # Category management components
│   ├── members/            # Member management components
│   └── shared/             # Reusable components (page-header, empty-state, etc.)
├── lib/
│   ├── db/                 # Database connection, schema, seed
│   ├── auth/               # Actor resolver, membership guards, user persistence
│   ├── actions/            # Server Actions (mutations)
│   ├── queries/            # Data fetching functions (reads)
│   └── validators/         # Zod schemas
└── hooks/                  # Custom React hooks
```

### Data Flow Pattern
- **Reads**: Server Components call functions from `lib/queries/` → Drizzle ORM → libSQL
- **Writes**: Client Components call Server Actions from `lib/actions/` → Zod validation → household-scoping check → Drizzle ORM → `revalidatePath()`
- Every action is wrapped in `safeAction` (`lib/actions/safe-action.ts`): thrown errors are logged and returned as `{ error }`; redirect() passes through
- All id-based mutations filter by the active household and return `{ error }` for foreign ids
- No API routes needed for CRUD; Server Actions handle all mutations (`/api/auth/*` is Auth.js)

### Database
- libSQL via `@libsql/client`: a local SQLite file `data/expense.db` (gitignored) in dev, a Turso cloud DB in prod
- Schema managed by Drizzle migrations (`pnpm db:migrate`); seeded on demand with `pnpm db:seed` (not auto-seeded)
- Tables: users, households, household_members, categories, expenses, settlements, activity
- Multi-household: the active household is resolved from the `he_household` cookie via `getCurrentHousehold()`, scoped to the current actor's memberships (superadmin sees all; a user only their `household_members` rows)
- IDs are cuid2 strings
- Timestamps stored as integer (unix epoch) via Drizzle `mode: "timestamp"`
- **Money**: stored as integer minor units (`expenses.amount_minor`, fixed scale 100 — see `lib/money.ts`); queries convert back to major units with one `/ 100.0` at the boundary, so components always see major units

## Package Manager
Uses **pnpm** (not npm/yarn). Always use `pnpm` commands.

## Commands
```bash
pnpm dev             # Start dev server
pnpm build           # Production build
pnpm lint            # Run ESLint
pnpm test            # Run Vitest (also in CI)
pnpm db:init         # Initialize and seed database
pnpm db:generate     # Generate Drizzle migrations
pnpm db:push         # Push schema to database
pnpm add <pkg>       # Add a dependency
pnpm dlx <cmd>       # Run a one-off command (replaces npx)
```

## Key Conventions
- Server Components are the default; add `"use client"` only when needed (forms, charts, interactive UI)
- All form mutations go through Server Actions with Zod validation
- Imports use `@/` alias (maps to `src/`)
- shadcn/ui components are in `src/components/ui/` - add new ones via `npx shadcn@latest add <component>`
- Category icons use lucide-react icon names mapped in `components/expenses/category-icon.tsx`
- Currency formatting uses `Intl.NumberFormat` via `components/shared/currency-display.tsx`

## Auth Status
- **Implemented (Model B — user-owned households)**: each request resolves to one principal via `getCurrentActor()` (`src/lib/auth/actor.ts`): a **superadmin** (shared passcode, entered at `/admin`, god-mode across all households) or a scoped **user** (Google/Auth.js v5 JWT). A user can only read/write households they belong to (`household_members.user_id`); the passcode is NOT the everyday path. Users are persisted on first sign-in (`upsertUserByEmail`, `src/lib/auth/users.ts`); invites are email rows on `household_members` claimed on next login (`inviteToHousehold` + `claimInvites`). A user with no households still enters the app shell freely and sees a friendly empty state on each menu (`<NoHousehold>`, `src/components/shared/no-household.tsx`) with a "Create household" CTA → `/households` — no forced onboarding (the old `FirstHousehold` gate was removed 2026-06-22). Design/plan: `docs/superpowers/{specs,plans}/2026-06-16-model-b-*`.
- Requires `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `HOUSEHOLD_ALLOWED_EMAILS` in env (see `.env.example`). An empty allow-list denies all Google sign-ins in production (fails closed); sign-in is also allowed for any email that already has a membership/invite.
- **Deploy cut:** `SESSION_VERSION` was bumped `v1`→`v2`, invalidating all pre-Model-B passcode cookies (family members re-auth via Google; the owner re-unlocks `/admin` once). After deploy, run `pnpm db:migrate` then `pnpm db:migrate:model-b` (owner backfill → `mangatinanda@gmail.com`) against prod Turso.

## Environment Variables
See `.env.example` for required variables.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
