# Settle-up balances + household activity log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Splitwise-style settle-up (net balances, recorded settlements, minimal-payment suggestions) and an append-only household activity feed, both scoped to the active household.

**Architecture:** Approach 1 — balances are computed **on read** from existing `expenses` plus a new `settlements` table (never materialized); a new append-only `activity` table is written by a best-effort `logActivity()` helper inside each server action. Equal split over members with a new `include_in_settle_up` toggle. All additive — no changes to expense logic.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Drizzle ORM over libSQL/Turso (SQLite), Zod v4 (`zod/v4`), Recharts, shadcn/ui, Vitest. pnpm.

Spec: `docs/superpowers/specs/2026-06-22-settle-up-and-activity-log-design.md`.

## Global Constraints

- **Money is integer minor units** (scale 100). Balance math runs entirely in minor units; convert to major (`/100`) only at the view boundary. Use `toMinorUnits()` from `@/lib/money` for major→minor.
- **IDs** are cuid2 via `createId()` from `@paralleldrive/cuid2`.
- **Dates** are ISO `YYYY-MM-DD` strings; **timestamps** use Drizzle `integer({ mode: "timestamp" })`.
- **Every mutation** is a Server Action wrapped in `safeAction("name", async (...) => ...)` from `@/lib/actions/safe-action`, validates with Zod, resolves `getCurrentHousehold()`, scopes all id filters to that household, returns `{ error: string }` or `{ success: true, ... }`, and calls `revalidatePath()`.
- **Imports** use the `@/` alias. **Add an import in the same edit as its first use** — the repo's pre-commit/biome prunes momentarily-unused imports.
- **Tests** use Vitest against in-memory libSQL: set `process.env.DATABASE_URL = ":memory:"` in a `vi.hoisted(...)` block, `await migrate(db, { migrationsFolder: "drizzle" })` in `beforeAll`, and mock `next/headers`, `next/cache`, and `@/lib/auth/actor` as the existing tests do (see `src/lib/actions/scoping.test.ts`, `src/lib/actions/import-actions.test.ts`).
- **Verification gate** each engineer runs before declaring done: `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm exec biome ci .`. UI tasks also run `DATABASE_URL="file:./data/expense.db" AUTH_SECRET=x HOUSEHOLD_PASSCODE=x pnpm build`.
- **Token-only styling** in components (per `.claude/rules/ui.md`): semantic tokens (`bg-card`, `text-muted-foreground`, `text-destructive`, `var(--chart-N)`), `cn()` for class merging, ≥44px touch targets, animations no-op under reduced motion (`motion-reduce:` or `useReducedMotion`).

---

### Task 1: Schema + migration (settlements, activity, member toggle)

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create (generated): `drizzle/0006_*.sql` + snapshot

**Interfaces:**
- Produces: tables `settlements`, `activity`; column `householdMembers.includeInSettleUp` (boolean, default true); types `Settlement`, `NewSettlement`, `Activity`, `NewActivity`.

- [ ] **Step 1: Add the `include_in_settle_up` column to `householdMembers`.**
In `src/lib/db/schema.ts`, inside the existing `householdMembers` `sqliteTable` column object, add after the `role` column (before `createdAt`):

```ts
    includeInSettleUp: integer("include_in_settle_up", { mode: "boolean" })
      .notNull()
      .default(true),
```

- [ ] **Step 2: Add the `settlements` and `activity` tables.**
In `src/lib/db/schema.ts`, after the `expenses` table definition and before the `// Type exports` comment, add:

```ts
// A recorded payback (from_member paid to_member). Kept separate from expenses
// so settlements never appear in spending charts/reports.
export const settlements = sqliteTable(
  "settlements",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    fromMemberId: text("from_member_id")
      .notNull()
      .references(() => householdMembers.id),
    toMemberId: text("to_member_id")
      .notNull()
      .references(() => householdMembers.id),
    amountMinor: integer("amount_minor").notNull(),
    date: text("date").notNull(), // ISO YYYY-MM-DD
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("settlements_household_date_idx").on(table.householdId, table.date),
  ],
);

// Append-only household audit feed. actor_label + summary are denormalized so
// the feed renders after referenced rows are edited/deleted (see spec).
export const activity = sqliteTable(
  "activity",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    actorUserId: text("actor_user_id").references(() => users.id),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    metadata: text("metadata"), // optional JSON string
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("activity_household_created_idx").on(
      table.householdId,
      table.createdAt,
    ),
  ],
);
```

- [ ] **Step 3: Add type exports.**
At the end of `src/lib/db/schema.ts` (with the other `export type` lines), add:

```ts
export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;
export type Activity = typeof activity.$inferSelect;
export type NewActivity = typeof activity.$inferInsert;
```

- [ ] **Step 4: Generate the migration.**
Run: `pnpm db:generate`
Expected: "Your SQL migration file ➜ drizzle/0006_*.sql" and the printed table list includes `settlements 8 columns`, `activity 7 columns`, and `household_members` with the new column.

- [ ] **Step 5: Sanity-check the migration is additive.**
Open the generated `drizzle/0006_*.sql`. Expected: `CREATE TABLE settlements (...)`, `CREATE TABLE activity (...)`, and an `ALTER TABLE household_members ADD ... include_in_settle_up ... DEFAULT true` (or table recreate preserving data). No `DROP`/destructive ops on existing data.

- [ ] **Step 6: Verify the suite still migrates + passes.**
Run: `pnpm test`
Expected: all existing tests pass (they run the migrations folder, now including 0006).
Run: `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(db): settlements + activity tables, member include_in_settle_up"
```

---

### Task 2: Balance math (pure functions)

**Files:**
- Create: `src/lib/settle-up/balances.ts`
- Test: `src/lib/settle-up/balances.test.ts`

**Interfaces:**
- Produces:
  - `computeShares(totalMinor: number, participantIds: string[]): Map<string, number>`
  - `computeNetBalances(input: { participantIds: string[]; paid: { memberId: string; paidMinor: number }[]; settlements: { fromMemberId: string; toMemberId: string; amountMinor: number }[] }): { memberId: string; netMinor: number }[]`
  - `simplifyDebts(balances: { memberId: string; netMinor: number }[]): { fromMemberId: string; toMemberId: string; amountMinor: number }[]`

- [ ] **Step 1: Write the failing tests.**
Create `src/lib/settle-up/balances.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  computeNetBalances,
  computeShares,
  simplifyDebts,
} from "@/lib/settle-up/balances";

describe("computeShares", () => {
  it("splits evenly when divisible", () => {
    const s = computeShares(900, ["a", "b", "c"]);
    expect([...s.values()]).toEqual([300, 300, 300]);
  });
  it("distributes the remainder one minor unit at a time (by id order)", () => {
    const s = computeShares(1000, ["a", "b", "c"]); // 1000/3 = 333 r1
    expect(s.get("a")).toBe(334);
    expect(s.get("b")).toBe(333);
    expect(s.get("c")).toBe(333);
    expect([...s.values()].reduce((x, y) => x + y, 0)).toBe(1000);
  });
  it("returns empty for no participants", () => {
    expect(computeShares(500, []).size).toBe(0);
  });
});

describe("computeNetBalances", () => {
  it("nets paid minus equal share; balances sum to zero", () => {
    const nets = computeNetBalances({
      participantIds: ["a", "b", "c"],
      paid: [
        { memberId: "a", paidMinor: 6000 },
        { memberId: "b", paidMinor: 3000 },
      ],
      settlements: [],
    });
    const byId = Object.fromEntries(nets.map((n) => [n.memberId, n.netMinor]));
    expect(byId.a).toBe(3000); // paid 6000, share 3000
    expect(byId.b).toBe(0);
    expect(byId.c).toBe(-3000);
    expect(nets.reduce((s, n) => s + n.netMinor, 0)).toBe(0);
  });
  it("ignores expenses paid by non-participants", () => {
    const nets = computeNetBalances({
      participantIds: ["a", "b"],
      paid: [
        { memberId: "a", paidMinor: 1000 },
        { memberId: "z", paidMinor: 5000 }, // z not a participant
      ],
      settlements: [],
    });
    const byId = Object.fromEntries(nets.map((n) => [n.memberId, n.netMinor]));
    // settleable total = 1000 only; share 500 each
    expect(byId.a).toBe(500);
    expect(byId.b).toBe(-500);
  });
  it("applies settlements (payer's debt shrinks, receiver's credit shrinks)", () => {
    const nets = computeNetBalances({
      participantIds: ["a", "b"],
      paid: [{ memberId: "a", paidMinor: 1000 }],
      settlements: [{ fromMemberId: "b", toMemberId: "a", amountMinor: 500 }],
    });
    const byId = Object.fromEntries(nets.map((n) => [n.memberId, n.netMinor]));
    expect(byId.a).toBe(0);
    expect(byId.b).toBe(0);
  });
});

describe("simplifyDebts", () => {
  it("produces transfers that zero everyone out", () => {
    const transfers = simplifyDebts([
      { memberId: "a", netMinor: 3000 },
      { memberId: "b", netMinor: 0 },
      { memberId: "c", netMinor: -3000 },
    ]);
    expect(transfers).toEqual([
      { fromMemberId: "c", toMemberId: "a", amountMinor: 3000 },
    ]);
  });
  it("handles multiple debtors/creditors with <= n-1 transfers", () => {
    const transfers = simplifyDebts([
      { memberId: "a", netMinor: 500 },
      { memberId: "b", netMinor: 500 },
      { memberId: "c", netMinor: -1000 },
    ]);
    expect(transfers.length).toBeLessThanOrEqual(2);
    const net = (id: string) =>
      transfers.reduce(
        (s, t) =>
          s + (t.toMemberId === id ? t.amountMinor : 0) -
          (t.fromMemberId === id ? t.amountMinor : 0),
        0,
      );
    expect(net("c")).toBe(1000); // c pays out 1000 total
  });
  it("returns nothing when all settled", () => {
    expect(
      simplifyDebts([
        { memberId: "a", netMinor: 0 },
        { memberId: "b", netMinor: 0 },
      ]),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `pnpm vitest run src/lib/settle-up/balances.test.ts`
Expected: FAIL — cannot import from `@/lib/settle-up/balances` (module not found).

- [ ] **Step 3: Implement the pure functions.**
Create `src/lib/settle-up/balances.ts`:

```ts
/**
 * Pure settle-up math (integer minor units; see spec). Equal split of the
 * settleable total among participants, netted against settlements, plus a
 * greedy debt-simplification.
 */

export interface MemberPaid {
  memberId: string;
  paidMinor: number;
}

export interface SettlementRow {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
}

export interface Balance {
  memberId: string;
  netMinor: number;
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
}

/** Equal shares of `totalMinor` across participants, distributing the leftover
 *  one minor unit at a time (deterministic id order) so shares sum to total. */
export function computeShares(
  totalMinor: number,
  participantIds: string[],
): Map<string, number> {
  const shares = new Map<string, number>();
  const n = participantIds.length;
  if (n === 0) return shares;
  const base = Math.floor(totalMinor / n);
  let remainder = totalMinor - base * n;
  for (const id of [...participantIds].sort()) {
    shares.set(id, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return shares;
}

/** Net balance per participant: paid − fair share + settled-out − settled-in.
 *  Only expenses paid by a participant count toward the settleable total. */
export function computeNetBalances(input: {
  participantIds: string[];
  paid: MemberPaid[];
  settlements: SettlementRow[];
}): Balance[] {
  const participants = new Set(input.participantIds);
  const paidByMember = new Map<string, number>();
  let total = 0;
  for (const p of input.paid) {
    if (!participants.has(p.memberId)) continue;
    paidByMember.set(
      p.memberId,
      (paidByMember.get(p.memberId) ?? 0) + p.paidMinor,
    );
    total += p.paidMinor;
  }
  const shares = computeShares(total, input.participantIds);
  const out = new Map<string, number>();
  const inn = new Map<string, number>();
  for (const s of input.settlements) {
    if (participants.has(s.fromMemberId)) {
      out.set(s.fromMemberId, (out.get(s.fromMemberId) ?? 0) + s.amountMinor);
    }
    if (participants.has(s.toMemberId)) {
      inn.set(s.toMemberId, (inn.get(s.toMemberId) ?? 0) + s.amountMinor);
    }
  }
  return input.participantIds.map((id) => ({
    memberId: id,
    netMinor:
      (paidByMember.get(id) ?? 0) -
      (shares.get(id) ?? 0) +
      (out.get(id) ?? 0) -
      (inn.get(id) ?? 0),
  }));
}

/** Greedy minimal-ish set of transfers to zero out balances (≤ n−1). */
export function simplifyDebts(balances: Balance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.netMinor > 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.netMinor - a.netMinor);
  const debtors = balances
    .filter((b) => b.netMinor < 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.netMinor - b.netMinor);
  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci];
    const debt = debtors[di];
    const amount = Math.min(credit.netMinor, -debt.netMinor);
    if (amount > 0) {
      transfers.push({
        fromMemberId: debt.memberId,
        toMemberId: credit.memberId,
        amountMinor: amount,
      });
      credit.netMinor -= amount;
      debt.netMinor += amount;
    }
    if (credit.netMinor === 0) ci++;
    if (debt.netMinor === 0) di++;
  }
  return transfers;
}
```

- [ ] **Step 4: Run to verify it passes.**
Run: `pnpm vitest run src/lib/settle-up/balances.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/settle-up/balances.ts src/lib/settle-up/balances.test.ts
git commit -m "feat(settle-up): pure balance + debt-simplification math"
```

---

### Task 3: Activity logging helper + query

**Files:**
- Create: `src/lib/activity.ts`
- Create: `src/lib/queries/activity-queries.ts`
- Test: `src/lib/activity.test.ts`

**Interfaces:**
- Consumes: `getCurrentActor` (`@/lib/auth/actor`), `activity` table, `db`.
- Produces:
  - `type ActivityAction` (string union, see code)
  - `logActivity(input: { householdId: string; action: ActivityAction; summary: string; metadata?: unknown }): Promise<void>` — best-effort, never throws.
  - `getActivity(householdId: string, opts?: { before?: number; limit?: number }): Promise<{ id: string; actorLabel: string; action: string; summary: string; createdAt: Date }[]>`

- [ ] **Step 1: Write the failing test.**
Create `src/lib/activity.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";

const actorState = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return { actor: { kind: "superadmin" } as unknown };
});

vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { migrate } from "drizzle-orm/libsql/migrator";
import { logActivity } from "@/lib/activity";
import { getActivity } from "@/lib/queries/activity-queries";
import { db } from "@/lib/db";
import { households, householdMembers, users } from "@/lib/db/schema";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db
    .insert(users)
    .values({ id: "u1", name: "Nanda", email: "n@x.com" });
  await db.insert(householdMembers).values({
    id: "m1",
    householdId: "h1",
    userId: "u1",
    name: "Nanda",
    role: "admin",
  });
});

describe("logActivity + getActivity", () => {
  it("logs a superadmin action as 'Admin' and reads it back", async () => {
    actorState.actor = { kind: "superadmin" };
    await logActivity({ householdId: "h1", action: "expense.create", summary: 'added "Groceries ₹1,000"' });
    const rows = await getActivity("h1");
    expect(rows[0]).toMatchObject({ actorLabel: "Admin", summary: 'added "Groceries ₹1,000"' });
  });

  it("labels a user action with their household member name", async () => {
    actorState.actor = { kind: "user", userId: "u1", email: "n@x.com" };
    await logActivity({ householdId: "h1", action: "settlement.create", summary: "settled ₹500 to Siva" });
    const rows = await getActivity("h1");
    expect(rows[0].actorLabel).toBe("Nanda"); // newest first
  });

  it("never throws (best-effort) on a bad household id", async () => {
    await expect(
      logActivity({ householdId: "nope", action: "expense.create", summary: "x" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `pnpm vitest run src/lib/activity.test.ts`
Expected: FAIL — cannot import `@/lib/activity` / `@/lib/queries/activity-queries`.

- [ ] **Step 3: Implement `logActivity`.**
Create `src/lib/activity.ts`:

```ts
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { activity, householdMembers, users } from "@/lib/db/schema";

export type ActivityAction =
  | "expense.create"
  | "expense.update"
  | "expense.delete"
  | "expense.import"
  | "settlement.create"
  | "settlement.delete"
  | "member.create"
  | "member.update"
  | "member.delete"
  | "category.create"
  | "category.update"
  | "category.delete"
  | "household.create"
  | "household.rename"
  | "household.delete";

/** Resolve a display name for the acting principal in this household. */
async function actorLabelFor(
  householdId: string,
): Promise<{ actorUserId: string | null; actorLabel: string }> {
  const actor = await getCurrentActor();
  if (!actor || actor.kind === "superadmin") {
    return { actorUserId: null, actorLabel: "Admin" };
  }
  const [member] = await db
    .select({ name: householdMembers.name })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, actor.userId),
      ),
    )
    .limit(1);
  if (member) return { actorUserId: actor.userId, actorLabel: member.name };
  const [u] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);
  return { actorUserId: actor.userId, actorLabel: u?.name ?? actor.email };
}

/**
 * Append one row to the household activity feed. BEST-EFFORT: any failure is
 * logged and swallowed so it never breaks the caller's mutation. Call AFTER
 * the mutation succeeds, before revalidate.
 */
export async function logActivity(input: {
  householdId: string;
  action: ActivityAction;
  summary: string;
  metadata?: unknown;
}): Promise<void> {
  try {
    const { actorUserId, actorLabel } = await actorLabelFor(input.householdId);
    await db.insert(activity).values({
      id: createId(),
      householdId: input.householdId,
      actorUserId,
      actorLabel,
      action: input.action,
      summary: input.summary,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
  } catch (err) {
    console.error("[logActivity] failed (ignored):", err);
  }
}
```

- [ ] **Step 4: Implement `getActivity`.**
Create `src/lib/queries/activity-queries.ts`:

```ts
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { activity } from "@/lib/db/schema";

/** Newest-first activity for a household. `before` is a unix-ms cursor for
 *  "show more" (pass the createdAt of the last row you have). */
export async function getActivity(
  householdId: string,
  opts: { before?: number; limit?: number } = {},
) {
  const limit = opts.limit ?? 50;
  return db
    .select({
      id: activity.id,
      actorLabel: activity.actorLabel,
      action: activity.action,
      summary: activity.summary,
      createdAt: activity.createdAt,
    })
    .from(activity)
    .where(
      opts.before
        ? and(
            eq(activity.householdId, householdId),
            lt(activity.createdAt, new Date(opts.before)),
          )
        : eq(activity.householdId, householdId),
    )
    .orderBy(desc(activity.createdAt))
    .limit(limit);
}
```

- [ ] **Step 5: Run to verify it passes.**
Run: `pnpm vitest run src/lib/activity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/activity.ts src/lib/queries/activity-queries.ts src/lib/activity.test.ts
git commit -m "feat(activity): best-effort logActivity helper + getActivity query"
```

---

### Task 4: Settle-up queries

**Files:**
- Create: `src/lib/queries/settle-up-queries.ts`
- Test: `src/lib/queries/settle-up-queries.test.ts`

**Interfaces:**
- Consumes: balance math (Task 2), `expenses`/`settlements`/`householdMembers` tables.
- Produces:
  - `getSettleUp(householdId): Promise<{ balances: { memberId: string; name: string; avatar: string | null; net: number }[]; suggestions: { fromId: string; fromName: string; toId: string; toName: string; amount: number }[]; settledUp: boolean }>` (amounts in **major** units)
  - `getSettlements(householdId): Promise<{ id: string; fromName: string; toName: string; amount: number; date: string; note: string | null }[]>`

- [ ] **Step 1: Write the failing test.**
Create `src/lib/queries/settle-up-queries.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
});

import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import {
  categories,
  expenses,
  householdMembers,
  households,
  settlements,
} from "@/lib/db/schema";
import { getSettleUp } from "@/lib/queries/settle-up-queries";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db.insert(householdMembers).values([
    { id: "ma", householdId: "h1", name: "A", role: "admin" },
    { id: "mb", householdId: "h1", name: "B", role: "member" },
    { id: "mx", householdId: "h1", name: "X", role: "member", includeInSettleUp: false },
  ]);
  await db.insert(categories).values({ id: "c1", householdId: "h1", name: "Cat" });
  // A paid 6000, B paid 0; X (excluded) paid 5000 → ignored.
  await db.insert(expenses).values([
    { id: "e1", householdId: "h1", categoryId: "c1", memberId: "ma", amountMinor: 600000, description: "A", date: "2026-06-01" },
    { id: "e2", householdId: "h1", categoryId: "c1", memberId: "mx", amountMinor: 500000, description: "X", date: "2026-06-01" },
  ]);
});

describe("getSettleUp", () => {
  it("computes net balances over participants only, in major units", async () => {
    const res = await getSettleUp("h1");
    const byId = Object.fromEntries(res.balances.map((b) => [b.memberId, b.net]));
    // settleable total = 6000 (A only); share 3000 each among A,B
    expect(byId.ma).toBe(3000);
    expect(byId.mb).toBe(-3000);
    expect(res.balances.find((b) => b.memberId === "mx")).toBeUndefined();
    expect(res.suggestions).toEqual([
      { fromId: "mb", fromName: "B", toId: "ma", toName: "A", amount: 3000 },
    ]);
    expect(res.settledUp).toBe(false);
  });

  it("reflects a recorded settlement", async () => {
    await db.insert(settlements).values({
      id: "s1", householdId: "h1", fromMemberId: "mb", toMemberId: "ma",
      amountMinor: 300000, date: "2026-06-02",
    });
    const res = await getSettleUp("h1");
    expect(res.settledUp).toBe(true);
    expect(res.suggestions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `pnpm vitest run src/lib/queries/settle-up-queries.test.ts`
Expected: FAIL — `getSettleUp` not found.

- [ ] **Step 3: Implement the queries.**
Create `src/lib/queries/settle-up-queries.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses, householdMembers, settlements } from "@/lib/db/schema";
import {
  computeNetBalances,
  simplifyDebts,
} from "@/lib/settle-up/balances";

export async function getSettleUp(householdId: string) {
  const members = await db
    .select({
      id: householdMembers.id,
      name: householdMembers.name,
      avatar: householdMembers.avatar,
      includeInSettleUp: householdMembers.includeInSettleUp,
    })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));

  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const participants = members.filter((m) => m.includeInSettleUp);
  const participantIds = participants.map((m) => m.id);

  // Raw minor-unit sums (NOT /100 — math runs in minor units).
  const paidRows = await db
    .select({
      memberId: expenses.memberId,
      paidMinor: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)`,
    })
    .from(expenses)
    .where(eq(expenses.householdId, householdId))
    .groupBy(expenses.memberId);

  const settlementRows = await db
    .select({
      fromMemberId: settlements.fromMemberId,
      toMemberId: settlements.toMemberId,
      amountMinor: settlements.amountMinor,
    })
    .from(settlements)
    .where(eq(settlements.householdId, householdId));

  const nets = computeNetBalances({
    participantIds,
    paid: paidRows,
    settlements: settlementRows,
  });
  const transfers = simplifyDebts(nets);

  const balances = nets.map((n) => {
    const m = participants.find((p) => p.id === n.memberId);
    return {
      memberId: n.memberId,
      name: m?.name ?? "",
      avatar: m?.avatar ?? null,
      net: n.netMinor / 100,
    };
  });

  const suggestions = transfers.map((t) => ({
    fromId: t.fromMemberId,
    fromName: nameById.get(t.fromMemberId) ?? "",
    toId: t.toMemberId,
    toName: nameById.get(t.toMemberId) ?? "",
    amount: t.amountMinor / 100,
  }));

  return { balances, suggestions, settledUp: transfers.length === 0 };
}

export async function getSettlements(householdId: string) {
  const rows = await db
    .select({
      id: settlements.id,
      fromMemberId: settlements.fromMemberId,
      toMemberId: settlements.toMemberId,
      amount: sql<number>`${settlements.amountMinor} / 100.0`,
      date: settlements.date,
      note: settlements.note,
    })
    .from(settlements)
    .where(eq(settlements.householdId, householdId))
    .orderBy(sql`${settlements.date} desc`);

  const members = await db
    .select({ id: householdMembers.id, name: householdMembers.name })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  return rows.map((r) => ({
    id: r.id,
    fromName: nameById.get(r.fromMemberId) ?? "",
    toName: nameById.get(r.toMemberId) ?? "",
    amount: r.amount,
    date: r.date,
    note: r.note,
  }));
}
```

- [ ] **Step 4: Run to verify it passes.**
Run: `pnpm vitest run src/lib/queries/settle-up-queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/queries/settle-up-queries.ts src/lib/queries/settle-up-queries.test.ts
git commit -m "feat(settle-up): getSettleUp + getSettlements queries"
```

---

### Task 5: Settlement validator + actions

**Files:**
- Create: `src/lib/validators/settlement-schema.ts`
- Create: `src/lib/actions/settlement-actions.ts`
- Test: `src/lib/actions/settlement-actions.test.ts`

**Interfaces:**
- Consumes: `logActivity` (Task 3), `rateLimit`/`RATE_LIMITS`/`RATE_LIMITED_MESSAGE` (`@/lib/rate-limit`), `getCurrentHousehold`.
- Produces:
  - `createSettlement(formData: FormData): Promise<{ error: string } | { success: true }>`
  - `deleteSettlement(id: string): Promise<{ error: string } | { success: true }>`

- [ ] **Step 1: Write the validator.**
Create `src/lib/validators/settlement-schema.ts`:

```ts
import { z } from "zod/v4";

export const settlementSchema = z
  .object({
    fromMemberId: z.string().min(1, "Who is paying?"),
    toMemberId: z.string().min(1, "Who is being paid?"),
    amount: z.coerce
      .number()
      .positive("Amount must be positive")
      .max(100_000_000, "Amount is too large")
      .refine(
        (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
        "Amount can have at most 2 decimal places",
      ),
    date: z.iso.date("Enter a valid date (YYYY-MM-DD)"),
    note: z.string().max(500).optional(),
  })
  .refine((d) => d.fromMemberId !== d.toMemberId, {
    message: "A member can't settle with themselves",
    path: ["toMemberId"],
  });

export type SettlementFormData = z.infer<typeof settlementSchema>;
```

- [ ] **Step 2: Write the failing test.**
Create `src/lib/actions/settlement-actions.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return new Map<string, string>();
});
const actorState = vi.hoisted(() => ({ actor: { kind: "superadmin" } as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (cookieJar.has(n) ? { name: n, value: cookieJar.get(n)! } : undefined),
    set: (n: string, v: string) => void cookieJar.set(n, v),
    delete: (n: string) => void cookieJar.delete(n),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({ getCurrentActor: async () => actorState.actor }));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createSettlement, deleteSettlement } from "@/lib/actions/settlement-actions";
import { db } from "@/lib/db";
import { activity, householdMembers, households, settlements } from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db.insert(householdMembers).values([
    { id: "ma", householdId: "h1", name: "A", role: "admin" },
    { id: "mb", householdId: "h1", name: "B", role: "member" },
    { id: "mx", householdId: "h1", name: "X", role: "member", includeInSettleUp: false },
  ]);
});

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = { kind: "superadmin" };
});

describe("createSettlement", () => {
  it("records a settlement between participants and logs activity", async () => {
    const res = await createSettlement(
      form({ fromMemberId: "mb", toMemberId: "ma", amount: "12.00", date: "2026-06-02" }),
    );
    expect(res).toEqual({ success: true });
    const rows = await db.select().from(settlements).where(eq(settlements.householdId, "h1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].amountMinor).toBe(1200);
    const log = await db.select().from(activity).where(eq(activity.action, "settlement.create"));
    expect(log).toHaveLength(1);
  });

  it("rejects from==to", async () => {
    const res = await createSettlement(
      form({ fromMemberId: "ma", toMemberId: "ma", amount: "5", date: "2026-06-02" }),
    );
    expect(res.error).toBeTruthy();
  });

  it("rejects a non-participant member", async () => {
    const res = await createSettlement(
      form({ fromMemberId: "mx", toMemberId: "ma", amount: "5", date: "2026-06-02" }),
    );
    expect(res.error).toMatch(/settle-up/i);
  });
});

describe("deleteSettlement", () => {
  it("deletes a household-scoped settlement", async () => {
    const [row] = await db.select().from(settlements).where(eq(settlements.householdId, "h1"));
    const res = await deleteSettlement(row.id);
    expect(res).toEqual({ success: true });
    expect(await db.select().from(settlements).where(eq(settlements.id, row.id))).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run to verify it fails.**
Run: `pnpm vitest run src/lib/actions/settlement-actions.test.ts`
Expected: FAIL — `createSettlement` not found.

- [ ] **Step 4: Implement the actions.**
Create `src/lib/actions/settlement-actions.ts`:

```ts
"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { householdMembers, settlements } from "@/lib/db/schema";
import { toMinorUnits } from "@/lib/money";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import {
  RATE_LIMITED_MESSAGE,
  RATE_LIMITS,
  rateLimit,
} from "@/lib/rate-limit";
import { settlementSchema } from "@/lib/validators/settlement-schema";
import { safeAction } from "./safe-action";

export const createSettlement = safeAction(
  "createSettlement",
  async (formData: FormData) => {
    const parsed = settlementSchema.safeParse({
      fromMemberId: formData.get("fromMemberId"),
      toMemberId: formData.get("toMemberId"),
      amount: formData.get("amount"),
      date: formData.get("date"),
      note: formData.get("note") || undefined,
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    const rl = await rateLimit(`settlement:${household.id}`, {
      limit: RATE_LIMITS.expenseWritesPerMinute,
      windowSec: 60,
    });
    if (rl.limited) return { error: RATE_LIMITED_MESSAGE };

    // Both members must be participants (include_in_settle_up) of THIS household.
    const members = await db
      .select({ id: householdMembers.id, name: householdMembers.name })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, household.id),
          eq(householdMembers.includeInSettleUp, true),
        ),
      );
    const byId = new Map(members.map((m) => [m.id, m.name]));
    if (!byId.has(parsed.data.fromMemberId) || !byId.has(parsed.data.toMemberId)) {
      return { error: "Both members must be in settle-up for this household" };
    }

    await db.insert(settlements).values({
      id: createId(),
      householdId: household.id,
      fromMemberId: parsed.data.fromMemberId,
      toMemberId: parsed.data.toMemberId,
      amountMinor: toMinorUnits(parsed.data.amount),
      date: parsed.data.date,
      note: parsed.data.note?.trim() ? parsed.data.note.trim() : null,
    });

    await logActivity({
      householdId: household.id,
      action: "settlement.create",
      summary: `settled ₹${parsed.data.amount} from ${byId.get(parsed.data.fromMemberId)} to ${byId.get(parsed.data.toMemberId)}`,
    });

    revalidatePath("/settle-up");
    revalidatePath("/activity");
    return { success: true };
  },
);

export const deleteSettlement = safeAction(
  "deleteSettlement",
  async (id: string) => {
    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    const deleted = await db
      .delete(settlements)
      .where(
        and(eq(settlements.id, id), eq(settlements.householdId, household.id)),
      )
      .returning({ id: settlements.id });
    if (deleted.length === 0) return { error: "Settlement not found" };

    await logActivity({
      householdId: household.id,
      action: "settlement.delete",
      summary: "deleted a settlement",
    });

    revalidatePath("/settle-up");
    revalidatePath("/activity");
    return { success: true };
  },
);
```

- [ ] **Step 5: Run to verify it passes.**
Run: `pnpm vitest run src/lib/actions/settlement-actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/validators/settlement-schema.ts src/lib/actions/settlement-actions.ts src/lib/actions/settlement-actions.test.ts
git commit -m "feat(settle-up): createSettlement + deleteSettlement actions"
```

---

### Task 6: Member "include in settle-up" toggle

**Files:**
- Run: `pnpm dlx shadcn@latest add switch` (creates `src/components/ui/switch.tsx`)
- Modify: `src/lib/validators/member-schema.ts`
- Modify: `src/lib/actions/member-actions.ts`
- Modify: `src/lib/queries/member-queries.ts:13-33` (add field to `getMembersWithStats`)
- Modify: `src/components/members/member-manager.tsx`
- Test: extend `src/lib/actions/settlement-actions.test.ts` is not needed; add cases to a new `src/lib/actions/member-toggle.test.ts`

**Interfaces:**
- Consumes: `settlements` table, `Switch` ui component.
- Produces: `memberSchema` now includes `includeInSettleUp: boolean`; `getMembersWithStats` returns `includeInSettleUp`.

- [ ] **Step 1: Add the shadcn Switch primitive.**
Run: `pnpm dlx shadcn@latest add switch`
Expected: creates `src/components/ui/switch.tsx`. Run `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 2: Write the failing test.**
Create `src/lib/actions/member-toggle.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return new Map<string, string>();
});
const actorState = vi.hoisted(() => ({ actor: { kind: "superadmin" } as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (cookieJar.has(n) ? { name: n, value: cookieJar.get(n)! } : undefined),
    set: (n: string, v: string) => void cookieJar.set(n, v),
    delete: (n: string) => void cookieJar.delete(n),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({ getCurrentActor: async () => actorState.actor }));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createMember, deleteMember } from "@/lib/actions/member-actions";
import { db } from "@/lib/db";
import { householdMembers, households, settlements } from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "h1", name: "Home" });
});
beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = { kind: "superadmin" };
});

describe("member include_in_settle_up", () => {
  it("defaults to true and persists an off toggle on create", async () => {
    await createMember(form({ name: "On", role: "member" })); // no toggle field => default true
    await createMember(form({ name: "Off", role: "member", includeInSettleUp: "false" }));
    const rows = await db.select().from(householdMembers).where(eq(householdMembers.householdId, "h1"));
    expect(rows.find((m) => m.name === "On")?.includeInSettleUp).toBe(true);
    expect(rows.find((m) => m.name === "Off")?.includeInSettleUp).toBe(false);
  });

  it("blocks deleting a member referenced by a settlement", async () => {
    await createMember(form({ name: "Payer", role: "member" }));
    await createMember(form({ name: "Payee", role: "member" }));
    const [payer, payee] = await db.select().from(householdMembers).where(eq(householdMembers.householdId, "h1"));
    await db.insert(settlements).values({
      id: "s1", householdId: "h1", fromMemberId: payer.id, toMemberId: payee.id,
      amountMinor: 100, date: "2026-06-01",
    });
    const res = await deleteMember(payer.id);
    expect(res.error).toMatch(/settlement/i);
  });
});
```

- [ ] **Step 3: Run to verify it fails.**
Run: `pnpm vitest run src/lib/actions/member-toggle.test.ts`
Expected: FAIL (member created with `includeInSettleUp` undefined/ignored; delete not blocked).

- [ ] **Step 4: Add `includeInSettleUp` to the member schema.**
In `src/lib/validators/member-schema.ts`, add to the object (after `email`):

```ts
  // The form posts a hidden "true"/"false". An ABSENT field (other callers,
  // e.g. existing tests) must default to true — so map undefined/""/null → true
  // BEFORE coercing, otherwise `.default` never fires and absence becomes false.
  includeInSettleUp: z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return true;
    return v === "true" || v === "on" || v === true;
  }, z.boolean()),
```

- [ ] **Step 5: Persist it in `createMember` and `updateMember`.**
In `src/lib/actions/member-actions.ts`:
- Add `includeInSettleUp: formData.get("includeInSettleUp"),` to BOTH `raw` objects.
- In `createMember`'s `db.insert(householdMembers).values({...})`, add `includeInSettleUp: parsed.data.includeInSettleUp,`.
- In `updateMember`'s `.set({...})`, add `includeInSettleUp: parsed.data.includeInSettleUp,`.

- [ ] **Step 6: Block deleting a member referenced by a settlement.**
In `src/lib/actions/member-actions.ts` `deleteMember`, import `settlements` (add to the `@/lib/db/schema` import) and `or` (add to the `drizzle-orm` import), then after the existing `linkedExpenses` guard add:

```ts
    const linkedSettlements = await db
      .select({ id: settlements.id })
      .from(settlements)
      .where(
        or(
          eq(settlements.fromMemberId, id),
          eq(settlements.toMemberId, id),
        ),
      )
      .limit(1);
    if (linkedSettlements.length > 0) {
      return {
        error:
          "Cannot delete a member referenced by a settlement. Delete those settlements first.",
      };
    }
```

- [ ] **Step 7: Return the field from `getMembersWithStats`.**
In `src/lib/queries/member-queries.ts`, add to the `.select({...})` of `getMembersWithStats` (after `userId`):

```ts
      includeInSettleUp: householdMembers.includeInSettleUp,
```

- [ ] **Step 7b: Ensure the members page forwards the field.**
Open `src/app/(app)/members/page.tsx`. It passes `getMembersWithStats(...)` rows to `<MemberManager members={...} />`. If it forwards the rows directly (spread/pass-through), no change is needed — `includeInSettleUp` now flows through. If it maps members into explicit objects, add `includeInSettleUp: m.includeInSettleUp,` to that mapping so the new `MemberItem` field (Step 8) is satisfied. Confirm with `pnpm exec tsc --noEmit` after Step 8.

- [ ] **Step 8: Add the Switch to the member dialog + an indicator on the card.**
In `src/components/members/member-manager.tsx`:
- Add to `MemberItem`: `includeInSettleUp: boolean;`
- Import: `import { Switch } from "@/components/ui/switch";` and add `Scale` to the `lucide-react` import.
- Add a `useState` near the others: `const [includeInSettleUp, setIncludeInSettleUp] = useState(true);`
- In `openNew`: `setIncludeInSettleUp(true);`. In `openEdit`: `setIncludeInSettleUp(member.includeInSettleUp);`
- Inside the dialog `<form action={handleSubmit}>`, after the Role field, add:

```tsx
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="include-settle">Include in settle-up</Label>
                <p className="text-muted-foreground text-xs">
                  Off = attribution-only (won't owe or be owed).
                </p>
              </div>
              <input
                type="hidden"
                name="includeInSettleUp"
                value={includeInSettleUp ? "true" : "false"}
              />
              <Switch
                id="include-settle"
                checked={includeInSettleUp}
                onCheckedChange={setIncludeInSettleUp}
              />
            </div>
```

- On the member card, after the role/access badges block, add an indicator when excluded:

```tsx
                        {!member.includeInSettleUp && (
                          <Badge variant="secondary" className="text-xs">
                            Not in settle-up
                          </Badge>
                        )}
```

- [ ] **Step 9: Run tests + typecheck.**
Run: `pnpm vitest run src/lib/actions/member-toggle.test.ts`
Expected: PASS.
Run: `pnpm exec tsc --noEmit` → clean. Run `pnpm test` → all pass (the existing `scoping.test.ts` member tests still pass; `memberSchema` email is optional, `includeInSettleUp` defaults true).

- [ ] **Step 10: Commit.**

```bash
git add src/components/ui/switch.tsx src/lib/validators/member-schema.ts src/lib/actions/member-actions.ts src/lib/queries/member-queries.ts src/components/members/member-manager.tsx src/lib/actions/member-toggle.test.ts
git commit -m "feat(members): include-in-settle-up toggle + settlement delete guard"
```

---

### Task 7: Instrument existing actions with activity logging

**Files (all Modify):** `src/lib/actions/expense-actions.ts`, `category-actions.ts`, `member-actions.ts`, `household-actions.ts`, `invite-actions.ts`, `import-actions.ts`
- Test: `src/lib/actions/activity-instrumentation.test.ts`

**Interfaces:**
- Consumes: `logActivity` (Task 3). Each action gains a `logActivity(...)` call after its successful mutation, before `revalidate`.

For each action below, add `import { logActivity } from "@/lib/activity";` (in the same edit as its first use) and insert the `await logActivity({...})` call **after** the mutation succeeds and **before** the `return { success: true }`. Use `household.id` for `householdId`.

- [ ] **Step 1: Write the failing test (representative coverage).**
Create `src/lib/actions/activity-instrumentation.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return new Map<string, string>();
});
const actorState = vi.hoisted(() => ({ actor: { kind: "superadmin" } as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (cookieJar.has(n) ? { name: n, value: cookieJar.get(n)! } : undefined),
    set: (n: string, v: string) => void cookieJar.set(n, v),
    delete: (n: string) => void cookieJar.delete(n),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({ getCurrentActor: async () => actorState.actor }));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createExpense } from "@/lib/actions/expense-actions";
import { db } from "@/lib/db";
import { activity, categories, householdMembers, households } from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db.insert(householdMembers).values({ id: "m1", householdId: "h1", name: "Me", role: "admin" });
  await db.insert(categories).values({ id: "c1", householdId: "h1", name: "Cat" });
});
beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = { kind: "superadmin" };
});

describe("activity instrumentation", () => {
  it("createExpense appends an expense.create activity row", async () => {
    await createExpense(
      form({ amount: "10.00", description: "Groceries", categoryId: "c1", memberId: "m1", date: "2026-06-01", notes: "" }),
    );
    const rows = await db.select().from(activity).where(eq(activity.action, "expense.create"));
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toContain("Groceries");
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `pnpm vitest run src/lib/actions/activity-instrumentation.test.ts`
Expected: FAIL (no activity row).

- [ ] **Step 3: Instrument `expense-actions.ts`.**
- `createExpense` — after the insert, before `revalidatePath("/dashboard")`:
  `await logActivity({ householdId: household.id, action: "expense.create", summary: \`added "${parsed.data.description}" ₹${parsed.data.amount}\` });`
- `updateExpense` — after the update succeeds:
  `await logActivity({ householdId: household.id, action: "expense.update", summary: \`edited "${parsed.data.description}"\` });`
- `deleteExpense` — the action only has the id + the deleted row. After the delete succeeds (you have `deleted[0].id`), add:
  `await logActivity({ householdId: household.id, action: "expense.delete", summary: "deleted an expense" });`
  Add `revalidatePath("/activity");` to each.

- [ ] **Step 4: Instrument `category-actions.ts`.**
- `createCategory`: `await logActivity({ householdId: household.id, action: "category.create", summary: \`added category "${parsed.data.name}"\` });`
- `updateCategory`: `await logActivity({ householdId: household.id, action: "category.update", summary: \`renamed a category to "${parsed.data.name}"\` });`
- `deleteCategory`: after the delete, `await logActivity({ householdId: household.id, action: "category.delete", summary: "deleted a category" });`

- [ ] **Step 5: Instrument `member-actions.ts`.**
- `createMember`: `await logActivity({ householdId: household.id, action: "member.create", summary: \`added member "${parsed.data.name}"\` });`
- `updateMember`: `await logActivity({ householdId: household.id, action: "member.update", summary: \`updated member "${parsed.data.name}"\` });`
- `deleteMember`: after the delete, `await logActivity({ householdId: household.id, action: "member.delete", summary: "removed a member" });`

- [ ] **Step 6: Instrument `household-actions.ts`.**
- `createHousehold`: after the batch insert (household.id is `householdId`): `await logActivity({ householdId, action: "household.create", summary: \`created household "${parsed.data.name}"\` });`
- `renameHousehold`: after update succeeds: `await logActivity({ householdId: id, action: "household.rename", summary: \`renamed the household to "${parsed.data.name}"\` });`
- `deleteHousehold`: this removes the household itself; **do not** log into the deleted household. Skip (no activity row — the household feed is gone with it).

- [ ] **Step 7: Instrument `invite-actions.ts` and `import-actions.ts`.**
- `inviteToHousehold`: after the insert: `await logActivity({ householdId: household.id, action: "member.create", summary: \`invited ${email}\` });`
- `importExpenses`: after the chunked insert loop, before `revalidatePath`: `await logActivity({ householdId: hid, action: "expense.import", summary: \`imported ${result.imported} expense${result.imported === 1 ? "" : "s"}\` });`

- [ ] **Step 8: Run the test + full suite.**
Run: `pnpm vitest run src/lib/actions/activity-instrumentation.test.ts` → PASS.
Run: `pnpm test` → all pass. `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 9: Commit.**

```bash
git add src/lib/actions/ src/lib/actions/activity-instrumentation.test.ts
git commit -m "feat(activity): log expense/category/member/household/invite/import events"
```

---

### Task 8: Settle-up page + components

**Files:**
- Create: `src/app/(app)/settle-up/page.tsx`
- Create: `src/components/settle-up/settle-up-view.tsx`

**Interfaces:**
- Consumes: `getSettleUp`, `getSettlements` (Task 4), `getMembers` (`@/lib/queries/member-queries`), `createSettlement`, `deleteSettlement` (Task 5), `useFormatCurrency`, `NoHousehold`.

- [ ] **Step 1: Create the server page.**
Create `src/app/(app)/settle-up/page.tsx`:

```tsx
import { NoHousehold } from "@/components/shared/no-household";
import { PageHeader } from "@/components/shared/page-header";
import { SettleUpView } from "@/components/settle-up/settle-up-view";
import { getMembers } from "@/lib/queries/member-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import {
  getSettleUp,
  getSettlements,
} from "@/lib/queries/settle-up-queries";

export const metadata = { title: "Settle Up" };
export const dynamic = "force-dynamic";

export default async function SettleUpPage() {
  const household = await getCurrentHousehold();
  if (!household) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settle up" />
        <NoHousehold />
      </div>
    );
  }

  const [settleUp, history, members] = await Promise.all([
    getSettleUp(household.id),
    getSettlements(household.id),
    getMembers(household.id),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Settle up"
        description="Who owes whom in this household"
      />
      <SettleUpView
        balances={settleUp.balances}
        suggestions={settleUp.suggestions}
        settledUp={settleUp.settledUp}
        history={history}
        participants={members
          .filter((m) => m.includeInSettleUp)
          .map((m) => ({ id: m.id, name: m.name }))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the client view.**
Create `src/components/settle-up/settle-up-view.tsx`:

```tsx
"use client";

import { ArrowRight, Check, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createSettlement,
  deleteSettlement,
} from "@/lib/actions/settlement-actions";
import { cn } from "@/lib/utils";

interface Balance { memberId: string; name: string; net: number }
interface Suggestion { fromId: string; fromName: string; toId: string; toName: string; amount: number }
interface HistoryRow { id: string; fromName: string; toName: string; amount: number; date: string; note: string | null }

export function SettleUpView({
  balances,
  suggestions,
  settledUp,
  history,
  participants,
}: {
  balances: Balance[];
  suggestions: Suggestion[];
  settledUp: boolean;
  history: HistoryRow[];
  participants: { id: string; name: string }[];
}) {
  const formatCurrency = useFormatCurrency();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prefill, setPrefill] = useState<{ fromId: string; toId: string; amount: string }>({
    fromId: participants[0]?.id ?? "",
    toId: participants[1]?.id ?? "",
    amount: "",
  });

  function openRecord(p?: Suggestion) {
    setPrefill(
      p
        ? { fromId: p.fromId, toId: p.toId, amount: String(p.amount) }
        : { fromId: participants[0]?.id ?? "", toId: participants[1]?.id ?? "", amount: "" },
    );
    setOpen(true);
  }

  async function handleRecord(formData: FormData) {
    setLoading(true);
    try {
      const res = await createSettlement(formData);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Settlement recorded");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await deleteSettlement(id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Settlement removed");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Balances</CardTitle>
          <Button variant="outline" size="sm" onClick={() => openRecord()}>
            Record a payment
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {balances.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No one is in settle-up yet. Toggle members in from the Members page.
            </p>
          ) : (
            balances.map((b) => (
              <div key={b.memberId} className="flex items-center justify-between">
                <span>{b.name}</span>
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    b.net > 0 && "text-primary",
                    b.net < 0 && "text-destructive",
                  )}
                >
                  {b.net > 0 ? "is owed " : b.net < 0 ? "owes " : "settled "}
                  {b.net !== 0 && formatCurrency(Math.abs(b.net))}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suggested payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {settledUp ? (
            <p className="flex items-center gap-2 text-muted-foreground text-sm">
              <Check className="h-4 w-4 text-primary" /> All settled up 🎉
            </p>
          ) : (
            suggestions.map((s) => (
              <div
                key={`${s.fromId}-${s.toId}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-2"
              >
                <span className="flex items-center gap-2 text-sm">
                  {s.fromName} <ArrowRight className="h-3.5 w-3.5" /> {s.toName}
                  <span className="font-medium tabular-nums">
                    {formatCurrency(s.amount)}
                  </span>
                </span>
                <Button size="sm" onClick={() => openRecord(s)}>
                  Settle up
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {h.date}: {h.fromName} → {h.toName}{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatCurrency(h.amount)}
                  </span>
                  {h.note ? ` · ${h.note}` : ""}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive"
                  aria-label="Delete settlement"
                  onClick={() => handleDelete(h.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
          </DialogHeader>
          <form action={handleRecord} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fromMemberId">From</Label>
                <select
                  id="fromMemberId"
                  name="fromMemberId"
                  defaultValue={prefill.fromId}
                  className="h-11 w-full rounded-md border border-input bg-card px-2 text-sm"
                >
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="toMemberId">To</Label>
                <select
                  id="toMemberId"
                  name="toMemberId"
                  defaultValue={prefill.toId}
                  className="h-11 w-full rounded-md border border-input bg-card px-2 text-sm"
                >
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" name="amount" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={prefill.amount} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" defaultValue={new Date().toLocaleDateString("en-CA")} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Input id="note" name="note" placeholder="e.g. UPI" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Record"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Verify build + typecheck + lint.**
Run: `pnpm exec tsc --noEmit` → clean.
Run: `pnpm exec biome ci src/app/(app)/settle-up src/components/settle-up` → clean.
Run: `DATABASE_URL="file:./data/expense.db" AUTH_SECRET=x HOUSEHOLD_PASSCODE=x pnpm build` → succeeds; route list includes `/settle-up`.

- [ ] **Step 4: Manual smoke (dev).**
Run `pnpm dev`, sign in, visit `/settle-up`. Expected: balances list, a suggestion with "Settle up" that opens a prefilled dialog; recording a payment updates balances and adds a history row; deleting it reverts.

- [ ] **Step 5: Commit.**

```bash
git add "src/app/(app)/settle-up" src/components/settle-up
git commit -m "feat(settle-up): /settle-up page with balances, suggestions, history"
```

---

### Task 9: Activity feed page + component

**Files:**
- Create: `src/app/(app)/activity/page.tsx`
- Create: `src/components/activity/activity-feed.tsx`

**Interfaces:**
- Consumes: `getActivity` (Task 3), `NoHousehold`, `PageHeader`.
- Note: "Show more" loads older rows via a server action wrapper around `getActivity` (queries can't be called from the client directly). Add `loadMoreActivity(before: number)` to `activity-queries.ts`? No — create a tiny server action.

- [ ] **Step 1: Add a `loadMoreActivity` server action.**
Create `src/lib/actions/activity-actions.ts`:

```ts
"use server";

import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { getActivity } from "@/lib/queries/activity-queries";
import { safeAction } from "./safe-action";

export const loadMoreActivity = safeAction(
  "loadMoreActivity",
  async (beforeMs: number) => {
    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };
    const rows = await getActivity(household.id, { before: beforeMs, limit: 50 });
    return {
      success: true as const,
      rows: rows.map((r) => ({
        id: r.id,
        actorLabel: r.actorLabel,
        summary: r.summary,
        createdAt: r.createdAt.getTime(),
      })),
    };
  },
);
```

- [ ] **Step 2: Create the server page.**
Create `src/app/(app)/activity/page.tsx`:

```tsx
import { ActivityFeed } from "@/components/activity/activity-feed";
import { NoHousehold } from "@/components/shared/no-household";
import { PageHeader } from "@/components/shared/page-header";
import { getActivity } from "@/lib/queries/activity-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const household = await getCurrentHousehold();
  if (!household) {
    return (
      <div className="space-y-6">
        <PageHeader title="Activity" />
        <NoHousehold />
      </div>
    );
  }
  const rows = await getActivity(household.id, { limit: 50 });
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Activity" description="What's happened in this household" />
      <ActivityFeed
        initial={rows.map((r) => ({
          id: r.id,
          actorLabel: r.actorLabel,
          summary: r.summary,
          createdAt: r.createdAt.getTime(),
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create the client feed.**
Create `src/components/activity/activity-feed.tsx`:

```tsx
"use client";

import { format, isToday, isYesterday } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadMoreActivity } from "@/lib/actions/activity-actions";
import { Activity as ActivityIcon } from "lucide-react";

interface Row { id: string; actorLabel: string; summary: string; createdAt: number }

function dayLabel(ms: number) {
  const d = new Date(ms);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d, yyyy");
}

export function ActivityFeed({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initial.length < 50);

  async function showMore() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoading(true);
    try {
      const res = await loadMoreActivity(last.createdAt);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setRows((r) => [...r, ...res.rows]);
      if (res.rows.length < 50) setDone(true);
    } finally {
      setLoading(false);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ActivityIcon}
        title="No activity yet"
        description="Expenses, settlements, and member changes will show up here."
      />
    );
  }

  let lastDay = "";
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-1 pt-6">
          {rows.map((r) => {
            const label = dayLabel(r.createdAt);
            const showHeader = label !== lastDay;
            lastDay = label;
            return (
              <div key={r.id}>
                {showHeader && (
                  <p className="pt-3 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {label}
                  </p>
                )}
                <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
                  <span>
                    <span className="font-medium">{r.actorLabel}</span> {r.summary}
                  </span>
                  <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                    {format(new Date(r.createdAt), "h:mm a")}
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      {!done && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={showMore} disabled={loading}>
            {loading ? "Loading…" : "Show more"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify build + lint + typecheck.**
Run: `pnpm exec tsc --noEmit` → clean. `pnpm exec biome ci "src/app/(app)/activity" src/components/activity src/lib/actions/activity-actions.ts` → clean.
Run the build (as in Task 8 Step 3) → route list includes `/activity`.

- [ ] **Step 5: Commit.**

```bash
git add "src/app/(app)/activity" src/components/activity src/lib/actions/activity-actions.ts
git commit -m "feat(activity): /activity feed page with day grouping + show more"
```

---

### Task 10: Navigation wiring

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/mobile-nav.tsx`

**Interfaces:** none new — adds links to `/settle-up` and `/activity`.

- [ ] **Step 1: Sidebar — add both entries.**
In `src/components/layout/sidebar.tsx`, add `Activity` and `HandCoins` to the `lucide-react` import, then add to `navItems` after the Members entry:

```ts
  { href: "/settle-up", label: "Settle up", icon: HandCoins },
  { href: "/activity", label: "Activity", icon: Activity },
```

- [ ] **Step 2: Mobile nav — surface Settle up (swap Categories).**
In `src/components/layout/mobile-nav.tsx`, add `HandCoins` to the `lucide-react` import and replace the `Categories` entry in `navItems` with:

```ts
  { href: "/settle-up", label: "Settle up", icon: HandCoins },
```

(Result: Home, Expenses, Add (FAB), Settle up, Members. Categories + Activity remain reachable via the sidebar drawer.)

- [ ] **Step 3: Verify.**
Run: `pnpm exec tsc --noEmit` → clean. `pnpm exec biome ci src/components/layout` → clean.
Manual: both links appear in the sidebar; `/settle-up` is active-highlighted when on the page.

- [ ] **Step 4: Commit.**

```bash
git add src/components/layout/sidebar.tsx src/components/layout/mobile-nav.tsx
git commit -m "feat(nav): Settle up + Activity navigation entries"
```

---

### Task 11: Docs

**Files:** Modify `CLAUDE.md`, `memory.md`

- [ ] **Step 1: Update `CLAUDE.md`.**
In the "### Database" section, change the Tables line to:
`- Tables: users, households, household_members, categories, expenses, settlements, activity`
Add a bullet under Directory Structure noting `settle-up/` and `activity/` app routes + `lib/settle-up/` (balance math).

- [ ] **Step 2: Update `memory.md`.**
Add a dated work-log entry (2026-06-22): settle-up (equal split over the per-member `include_in_settle_up` toggle, recorded `settlements` + minimal-payment suggestions) and an append-only `activity` audit feed via best-effort `logActivity`; migration `0006`; pages `/settle-up` + `/activity`. Note the deferred per-expense-splits path.

- [ ] **Step 3: Final full verification.**
Run: `pnpm test` (all pass), `pnpm exec tsc --noEmit` (clean), `pnpm exec biome ci .` (clean), and the production build (Task 8 Step 3) → succeeds.

- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md memory.md
git commit -m "docs: settle-up + activity log (tables, routes, work log)"
```

---

## Deployment note (after merge)

Run the new migration against prod Turso (creds are Sensitive in Vercel — use Turso CLI creds, as in the prior deploy):
`DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" pnpm db:migrate`
Additive + backward-compatible (default `include_in_settle_up = true`; new tables unused by old code) — safe to run before or after the deploy. No backfill.
