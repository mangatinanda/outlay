# Library Directory Context

## db/
- `index.ts` - Database singleton. Uses better-sqlite3 with WAL mode and foreign keys enabled.
- `schema.ts` - Drizzle ORM table definitions. This is the schema source of truth.
- `seed.ts` - Seeds default household, member, categories, and sample expenses.
- `init.ts` - Raw SQL table creation (used by seed script before Drizzle is available).

## actions/
Server Actions follow this pattern:
1. Extract raw data from FormData
2. Validate with Zod schema
3. Get household context
4. Perform database operation
5. Call revalidatePath() for affected routes
6. Return `{ success: true }` or `{ error: string }`

## queries/
Pure data-fetching functions that return typed results. Used directly in Server Components.
- `dashboard-queries.ts` has aggregation queries for stats, charts, and breakdowns
- Other query files follow a simple pattern of select + join + where + orderBy

## validators/
Zod v4 schemas. Note: uses `import { z } from "zod/v4"` (Zod v4 subpath import).
