# Outlay - Household Expense Tracker

## Project Overview
A collaborative household expense tracking PWA built with Next.js 15, SQLite, and shadcn/ui. Designed for all family/home members to track shared expenses.

## Tech Stack
- **Framework**: Next.js 16 (App Router, React 19, Server Components, Server Actions)
- **Language**: TypeScript 5 (strict mode)
- **Styling**: Tailwind CSS v4 + shadcn/ui (base-nova style, OKLCH colors)
- **Database**: Turso/libSQL via @libsql/client + Drizzle ORM (local SQLite file in dev, Turso cloud in prod — same driver)
- **Validation**: Zod v4
- **Charts**: Recharts
- **Auth**: Shared-passcode gate (Web Crypto HMAC cookie, enforced in `proxy.ts`); Google sign-in planned (Auth.js v5 — see `plans/2026-06-09-google-login.md`)
- **PWA**: Web manifest + icons (Serwist service worker planned)
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
- **Reads**: Server Components call functions from `lib/queries/` → Drizzle ORM → SQLite
- **Writes**: Client Components call Server Actions from `lib/actions/` → Zod validation → Drizzle ORM → `revalidatePath()`
- No API routes needed for CRUD; Server Actions handle all mutations

### Database
- libSQL via `@libsql/client`: a local SQLite file `data/expense.db` (gitignored) in dev, a Turso cloud DB in prod
- Schema managed by Drizzle migrations (`pnpm db:migrate`); seeded on demand with `pnpm db:seed` (not auto-seeded)
- Tables: users, households, household_members, categories, expenses
- Multi-household: the active household is resolved from the `he_household` cookie via `getCurrentHousehold()`
- IDs are cuid2 strings
- Timestamps stored as integer (unix epoch) via Drizzle `mode: "timestamp"`

## Package Manager
Uses **pnpm** (not npm/yarn). Always use `pnpm` commands.

## Commands
```bash
pnpm dev             # Start dev server
pnpm build           # Production build
pnpm lint            # Run ESLint
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
- Google Sign-In button is UI-only (disabled state)
- Mock session in `lib/auth.ts`
- To enable: Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, then wire up NextAuth

## Environment Variables
See `.env.example` for required variables.
