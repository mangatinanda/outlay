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
- **Auth**: Two coexisting paths, either grants access (enforced in `proxy.ts`): Google sign-in (Auth.js v5, JWT sessions, `src/auth.ts`, allow-list in `src/lib/allow-list.ts` — FAILS CLOSED in production if `HOUSEHOLD_ALLOWED_EMAILS` is empty) OR shared-passcode gate (`src/lib/gate.ts`, expiring `v1.<issued-at>.<sig>` HMAC cookie, 30-day server-side expiry)
- **PWA**: @serwist/turbopack service worker (served at `/serwist/sw.js`), manifest + icons, `/~offline` fallback
- **Testing**: Vitest (`pnpm test`) — unit + integration against in-memory libSQL; GitHub Actions CI runs lint/typecheck/test/build
- **Date Utils**: date-fns

## Architecture

### Directory Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/             # Auth pages (login)
│   ├── (app)/              # Authenticated app pages
│   │   ├── dashboard/      # Main dashboard with charts
│   │   ├── expenses/       # CRUD expense pages
│   │   ├── categories/     # Category management
│   │   ├── members/        # Household member management
│   │   └── settings/       # App settings
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
- Tables: users, households, household_members, categories, expenses
- Multi-household: the active household is resolved from the `he_household` cookie via `getCurrentHousehold()`
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
- **Implemented (Model A)**: Google sign-in via Auth.js v5 (`src/auth.ts`, JWT, no DB adapter) coexists with the shared passcode; either grants access. Households remain shared by everyone who can sign in.
- Requires `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `HOUSEHOLD_ALLOWED_EMAILS` in env (see `.env.example`). An empty allow-list denies all Google sign-ins in production (fails closed) but allows all in development.
- **Model B** (per-user household ownership, passcode retired) is the documented future — see `plans/2026-06-09-google-login.md`.

## Environment Variables
See `.env.example` for required variables.
