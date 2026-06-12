# Library Directory Context

## db/
- `index.ts` - libSQL client singleton (`@libsql/client` + Drizzle). `DATABASE_URL` is a
  `file:` SQLite path in dev and a `libsql://` Turso URL (+ `TURSO_AUTH_TOKEN`) in prod —
  same driver for both. The client opens its connection eagerly at import time.
- `schema.ts` - Drizzle ORM table definitions. This is the schema source of truth.
  Money lives in `expenses.amount_minor` — integer minor units, fixed scale 100 (see `../money.ts`).
- `seed.ts` - Seeds default household, member, categories, and sample expenses (idempotent).
- Migrations are generated into `drizzle/` (`pnpm db:generate`) and applied with `pnpm db:migrate`.

## actions/
Server Actions follow this pattern:
1. Wrap the whole body in `safeAction("name", async (...) => { ... })` (`safe-action.ts`) —
   thrown errors are logged and become `{ error }`; `redirect()` passes through
2. Extract raw data from FormData
3. Validate with Zod schema → `{ error }` on failure
4. Get household context via `getCurrentHousehold()`
5. **Scope the mutation to the household**: updates/deletes filter
   `and(eq(table.id, id), eq(table.householdId, household.id))` and check `.returning()`
   for emptiness; expense create/update verifies categoryId/memberId ownership first
6. Convert money with `toMinorUnits()` before insert/update
7. Call `revalidatePath()` for affected routes
8. Return `{ success: true }` or `{ error: string }`

## queries/
Pure data-fetching functions that return typed results. Used directly in Server Components.
- `household-queries.ts` exports are wrapped in React `cache()` — one DB round-trip per request
- Amounts are converted back to major units in SQL (`amount_minor / 100.0`) so callers and
  components always see major units; sums are exact because they run over integers
- `getExpenseById(id, householdId)` is household-scoped
- `dashboard-queries.ts` has aggregation queries for stats, charts, and breakdowns

## validators/
Zod v4 schemas. Note: uses `import { z } from "zod/v4"` (Zod v4 subpath import).
- `expenseSchema`: amount positive, ≤ 100M, ≤ 2 decimal places; `date` is `z.iso.date()`
  (the column feeds lexicographic SQL range filters and `parseISO`)

## Tests
`*.test.ts` colocated with sources (Vitest). Integration tests run real Server Actions
against an in-memory libSQL DB (`DATABASE_URL=":memory:"` via `vi.hoisted`) with the actual
migrations; only `next/headers` (cookies) and `next/cache` are mocked.
