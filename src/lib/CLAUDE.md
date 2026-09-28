# Library Directory Context

## db/
- `index.ts` - libSQL client singleton (`@libsql/client` + Drizzle). `DATABASE_URL` is a
  `file:` SQLite path in dev and a `libsql://` Turso URL (+ `TURSO_AUTH_TOKEN`) in prod —
  same driver for both. The client opens eagerly at import time — except during `next build`
  (`NEXT_PHASE=phase-production-build`), where a lazy proxy defers it so a build without a
  reachable DB (Vercel previews, CI) still succeeds. `scripts/migrate-if-prod.mjs` applies
  pending migrations before a production build.
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
7. Multi-row writes use `db.batch([...])` in FK order (e.g. split rows before the expense);
   check existence with a scoped SELECT first, since a batch can't report "no row"
8. After the mutation: `logActivity()` (best-effort, never throws) and, where the spec says
   so, `notify()` — resolve recipients/labels BEFORE the insert so a failed lookup can't
   turn a committed row into a retried duplicate
9. Call `revalidatePath()` for affected routes
10. Return `{ success: true }` or `{ error: string }`

## queries/
Pure data-fetching functions that return typed results. Used directly in Server Components.
- `household-queries.ts` exports are wrapped in React `cache()` — one DB round-trip per request
- Amounts are converted back to major units in SQL (`amount_minor / 100.0`) so callers and
  components always see major units; sums are exact because they run over integers
- `getExpenseById(id, householdId)` is household-scoped
- `dashboard-queries.ts` has aggregation queries for stats, charts, and breakdowns
- `settle-up-queries.ts` computes balances on read: participant-paid expenses without split
  rows form an equal pool, split rows add explicit per-member shares, settlements net it out
  (`../settle-up/balances.ts` holds the pure math + greedy debt simplification)
- `activity-queries.ts` (feed + distinct actors), `notification-queries.ts` (per-user, invite
  state resolved live), `member-ledger.ts` (which ledger table still references a member —
  the guard behind member delete / invite decline / settle-up toggle)

## validators/
Zod v4 schemas. Note: uses `import { z } from "zod/v4"` (Zod v4 subpath import).
- `expenseSchema`: amount positive, ≤ 100M, ≤ 2 decimal places; `date` is `z.iso.date()`
  (the column feeds lexicographic SQL range filters and `parseISO`)
- `expense-splits-schema.ts`: `parseSplitsField(raw, amountMinor)` reads the form's JSON `splits`
  field (absent = equal split) and exports the error strings the form reuses client-side
- Also: `settlement-schema`, `member-schema` (role, include-in-settle-up, show-in-paid-by),
  `household-schema`, `settings-schema`, `accent-schema`, `invite-schema`, `import-schema`,
  and the URL-filter parsers `expense-filter-schema` / `activity-filter-schema` (defensive:
  a malformed query string degrades to "no filter", never an error)

## Tests
`*.test.ts` colocated with sources (Vitest). Integration tests run real Server Actions
against an in-memory libSQL DB (`DATABASE_URL=":memory:"` via `vi.hoisted`) with the actual
migrations; only `next/headers` (cookies) and `next/cache` are mocked.
