# Per-expense custom splits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an expense be split unevenly (or among a subset of people) so settle-up balances reflect who actually owes what, instead of always dividing every expense equally among all participants.

**Architecture:** Exactly the additive path the settle-up spec reserved: a new `expense_splits` table (`expense_id`, `member_id`, `share_minor`). An expense with **no** rows keeps today's equal split among current participants; only expenses with rows use their shares, so there is no backfill and imports stay equal-split. Balances stay compute-on-read: `share(p)` becomes "p's equal share of the pool of unsplit expenses + the sum of p's custom shares". The add/edit form gets a "Split" control (Equally / Custom) that posts a JSON `splits` field; the server validates that the shares sum to the amount and that every split member is a settle-up participant of the household.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle over libSQL, Zod 4 (`zod/v4`), shadcn/ui on Base UI, Vitest + Testing Library, Biome. pnpm.

**Spec:** `docs/superpowers/specs/2026-06-22-settle-up-and-activity-log-design.md` § "Future extension: per-expense custom splits".

## Global Constraints

- Money is integer minor units (scale 100); split math is integer-only; `toMinorUnits()` from `@/lib/money` at the boundary. Queries expose major units with one `/ 100.0`.
- IDs are cuid2 (`createId()`). libSQL enforces FKs: delete split rows before their expense, and before members/households.
- Server Actions: `safeAction`, Zod validation, `getCurrentHousehold()`, household-scoped ids, `{ error } | { success: true }`, `revalidatePath`.
- Migrations via `pnpm db:generate` (drizzle-kit); the file lands as `drizzle/0009_*.sql` + snapshot + journal entry. Never hand-edit `drizzle/meta`.
- Token-only styling (`.claude/rules/ui.md`), `cn()`, ≥44px touch targets. Form text: sentence case, no jargon ("Split", "Equally", "Custom").
- Tests: in-memory libSQL with `migrate(db, { migrationsFolder: "drizzle" })`; component tests under happy-dom. Imports added in the same edit as first use.
- Verification gate: `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm lint`, and a production build `DATABASE_URL="file:./data/expense.db" AUTH_SECRET=x HOUSEHOLD_PASSCODE=x pnpm build`.

## Review Focus

1. Shares that don't add up to the amount (rounding, a 0.01 gap) must be refused server-side with a plain message, never silently stored. (Task 2 validator test, Task 4 action test)
2. A split naming a member of another household, or one outside settle-up, must be refused. (Task 4 test)
3. Deleting an expense with split rows, and deleting a household containing such expenses, must not hit an FK error. (Task 4 tests)
4. Deleting a member who appears only in split rows (never paid, never settled) must be refused like other ledger references, not crash. (Task 4 test on `memberLedgerReference`)
5. Editing an expense from custom back to "Equally" must remove its rows so it returns to the equal pool. (Task 4 update test)

---

### Task 1: Schema + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (new table after `expenses`, type exports)
- Create (generated): `drizzle/0009_*.sql`, `drizzle/meta/0009_snapshot.json`, journal entry
- Modify: `CLAUDE.md` "Tables:" line

**Produces:** `expenseSplits` table; types `ExpenseSplit`, `NewExpenseSplit`.

- [ ] **Step 1: Add the table**

```ts
// Custom share of one expense for one member, in minor units. An expense with
// NO rows is split equally among the current settle-up participants (the
// pre-splits behavior); rows exist only for expenses split by hand. Rows for a
// member later toggled out of settle-up are ignored by the balance math.
export const expenseSplits = sqliteTable(
  "expense_splits",
  {
    id: text("id").primaryKey(),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id),
    memberId: text("member_id")
      .notNull()
      .references(() => householdMembers.id),
    shareMinor: integer("share_minor").notNull(),
  },
  (table) => [
    uniqueIndex("expense_splits_expense_member_uidx").on(
      table.expenseId,
      table.memberId,
    ),
    index("expense_splits_member_idx").on(table.memberId),
  ],
);
```

Add `uniqueIndex` to the `drizzle-orm/sqlite-core` import and export `ExpenseSplit = typeof expenseSplits.$inferSelect`, `NewExpenseSplit = typeof expenseSplits.$inferInsert`.

- [ ] **Step 2: Generate** — `pnpm db:generate`; confirm `drizzle/0009_*.sql` contains `CREATE TABLE \`expense_splits\`` with both indexes and two FKs. Run `pnpm test` (migrations apply in every DB test) — PASS.
- [ ] **Step 3: CLAUDE.md** — Tables line becomes `users, households, household_members, categories, expenses, expense_splits, settlements, activity, notifications`.
- [ ] **Step 4: Commit** — `feat(db): expense_splits table for per-expense custom shares`

---

### Task 2: Pure math + validator

**Files:**
- Modify: `src/lib/settle-up/balances.ts` (`computeNetBalances` accepts an equal pool + custom shares)
- Test: `src/lib/settle-up/balances.test.ts`
- Create: `src/lib/validators/expense-splits-schema.ts`
- Test: `src/lib/validators/expense-splits-schema.test.ts`

**Produces:**
- `computeNetBalances({ participantIds, paid, equalPoolMinor?, customShares?, settlements })` — `equalPoolMinor` defaults to the total of `paid` (old behavior); `customShares: { memberId, shareMinor }[]`.
- `parseSplitsField(raw: unknown, amountMinor: number): { splits: SplitInput[] | null } | { error: string }` where `SplitInput = { memberId: string; shareMinor: number }`; `null` = equal split.

- [ ] **Step 1: Failing math tests** — append to `balances.test.ts`:

```ts
describe("computeNetBalances with custom splits", () => {
  it("uses the custom shares of split expenses and the equal pool for the rest", () => {
    // A paid 1000 split A:200 / B:800; B paid 600 unsplit (equal pool).
    const nets = computeNetBalances({
      participantIds: ["a", "b"],
      paid: [
        { memberId: "a", paidMinor: 1000 },
        { memberId: "b", paidMinor: 600 },
      ],
      equalPoolMinor: 600,
      customShares: [
        { memberId: "a", shareMinor: 200 },
        { memberId: "b", shareMinor: 800 },
      ],
      settlements: [],
    });
    const byId = Object.fromEntries(nets.map((n) => [n.memberId, n.netMinor]));
    expect(byId.a).toBe(1000 - (300 + 200)); // 500
    expect(byId.b).toBe(600 - (300 + 800)); // -500
    expect(nets.reduce((s, n) => s + n.netMinor, 0)).toBe(0);
  });
  it("ignores custom shares for non-participants", () => {
    const nets = computeNetBalances({
      participantIds: ["a", "b"],
      paid: [{ memberId: "a", paidMinor: 1000 }],
      equalPoolMinor: 0,
      customShares: [
        { memberId: "a", shareMinor: 500 },
        { memberId: "z", shareMinor: 500 },
      ],
      settlements: [],
    });
    const byId = Object.fromEntries(nets.map((n) => [n.memberId, n.netMinor]));
    expect(byId.a).toBe(500);
    expect(byId.b).toBe(0);
  });
  it("defaults the equal pool to everything paid (legacy callers)", () => {
    const nets = computeNetBalances({
      participantIds: ["a", "b"],
      paid: [{ memberId: "a", paidMinor: 1000 }],
      settlements: [],
    });
    expect(nets.find((n) => n.memberId === "b")?.netMinor).toBe(-500);
  });
});
```

- [ ] **Step 2: Run** — FAIL (extra keys ignored → wrong numbers).
- [ ] **Step 3: Implement** — in `balances.ts` add `export interface MemberShare { memberId: string; shareMinor: number }` and change `computeNetBalances`:

```ts
export function computeNetBalances(input: {
  participantIds: string[];
  paid: MemberPaid[];
  /** Sum of participant-paid expenses WITHOUT split rows. Defaults to the
   *  total of `paid` (i.e. everything is equal-split). */
  equalPoolMinor?: number;
  /** Per-member shares from expenses WITH split rows (participant-paid only). */
  customShares?: MemberShare[];
  settlements: SettlementRow[];
}): Balance[] {
  const participants = new Set(input.participantIds);
  const paidByMember = new Map<string, number>();
  let total = 0;
  for (const p of input.paid) {
    if (!participants.has(p.memberId)) continue;
    paidByMember.set(p.memberId, (paidByMember.get(p.memberId) ?? 0) + p.paidMinor);
    total += p.paidMinor;
  }
  const equalShares = computeShares(input.equalPoolMinor ?? total, input.participantIds);
  const custom = new Map<string, number>();
  for (const s of input.customShares ?? []) {
    if (!participants.has(s.memberId)) continue;
    custom.set(s.memberId, (custom.get(s.memberId) ?? 0) + s.shareMinor);
  }
  // settlements loop unchanged …
  return input.participantIds.map((id) => ({
    memberId: id,
    netMinor:
      (paidByMember.get(id) ?? 0) -
      (equalShares.get(id) ?? 0) -
      (custom.get(id) ?? 0) +
      (out.get(id) ?? 0) -
      (inn.get(id) ?? 0),
  }));
}
```

Update the file's header comment to describe the two-part share.

- [ ] **Step 4: Run** `pnpm exec vitest run src/lib/settle-up` — PASS. Commit `feat(settle-up): balance math honours per-expense custom shares`.
- [ ] **Step 5: Failing validator tests** — `expense-splits-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseSplitsField } from "@/lib/validators/expense-splits-schema";

describe("parseSplitsField", () => {
  it("treats a missing or empty field as an equal split", () => {
    expect(parseSplitsField(null, 1000)).toEqual({ splits: null });
    expect(parseSplitsField("", 1000)).toEqual({ splits: null });
  });
  it("parses shares in minor units and drops zero rows", () => {
    const res = parseSplitsField(
      JSON.stringify([
        { memberId: "a", amount: "2.50" },
        { memberId: "b", amount: "7.50" },
        { memberId: "c", amount: "0" },
      ]),
      1000,
    );
    expect(res).toEqual({
      splits: [
        { memberId: "a", shareMinor: 250 },
        { memberId: "b", shareMinor: 750 },
      ],
    });
  });
  it("rejects shares that do not add up to the amount", () => {
    const res = parseSplitsField(
      JSON.stringify([{ memberId: "a", amount: "9.99" }]),
      1000,
    );
    expect(res).toEqual({ error: "Split amounts must add up to the expense amount" });
  });
  it("rejects a member listed twice, malformed JSON, and negative shares", () => {
    expect(
      parseSplitsField(JSON.stringify([{ memberId: "a", amount: 5 }, { memberId: "a", amount: 5 }]), 1000),
    ).toEqual({ error: "Each person can appear only once in a split" });
    expect(parseSplitsField("{nope", 1000)).toEqual({ error: "Invalid split" });
    expect(
      parseSplitsField(JSON.stringify([{ memberId: "a", amount: -1 }, { memberId: "b", amount: 11 }]), 1000),
    ).toMatchObject({ error: expect.any(String) });
  });
  it("rejects a split with nobody in it", () => {
    expect(parseSplitsField(JSON.stringify([]), 1000)).toMatchObject({ error: expect.any(String) });
    expect(parseSplitsField(JSON.stringify([{ memberId: "a", amount: 0 }]), 1000)).toEqual({
      error: "Choose at least one person to split with",
    });
  });
});
```

- [ ] **Step 6: Implement**

```ts
import { z } from "zod/v4";
import { toMinorUnits } from "@/lib/money";

/** Most people one expense can be split among (a household, not a wedding). */
export const MAX_SPLIT_MEMBERS = 50;

const shareAmount = z.coerce
  .number()
  .min(0, "A share can't be negative")
  .max(100_000_000, "Amount is too large")
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
    "Shares can have at most 2 decimal places",
  );

export const expenseSplitsSchema = z
  .array(z.object({ memberId: z.string().min(1).max(64), amount: shareAmount }))
  .min(1, "Choose at least one person to split with")
  .max(MAX_SPLIT_MEMBERS, "Too many people in one split")
  .refine(
    (rows) => new Set(rows.map((r) => r.memberId)).size === rows.length,
    "Each person can appear only once in a split",
  );

export interface SplitInput {
  memberId: string;
  shareMinor: number;
}

/**
 * Read the form's `splits` field (a JSON array of `{ memberId, amount }` in
 * major units). Absent/empty → `{ splits: null }` = equal split. Otherwise the
 * non-zero shares, in minor units, which must sum exactly to `amountMinor`.
 */
export function parseSplitsField(
  raw: unknown,
  amountMinor: number,
): { splits: SplitInput[] | null } | { error: string } {
  if (raw === null || raw === undefined || raw === "") return { splits: null };
  if (typeof raw !== "string") return { error: "Invalid split" };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: "Invalid split" };
  }
  const parsed = expenseSplitsSchema.safeParse(json);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const splits = parsed.data
    .map((s) => ({ memberId: s.memberId, shareMinor: toMinorUnits(s.amount) }))
    .filter((s) => s.shareMinor > 0);
  if (splits.length === 0) return { error: "Choose at least one person to split with" };
  const sum = splits.reduce((acc, s) => acc + s.shareMinor, 0);
  if (sum !== amountMinor) return { error: "Split amounts must add up to the expense amount" };
  return { splits };
}
```

- [ ] **Step 7: Run** `pnpm exec vitest run src/lib/validators` — PASS. Commit `feat(expenses): validate a custom split field`.

---

### Task 3: Queries

**Files:**
- Modify: `src/lib/queries/settle-up-queries.ts` (equal pool + custom share rows)
- Modify: `src/lib/queries/expense-queries.ts` (`getExpenseById` returns `splits`; `getExpenses` returns `hasCustomSplit`)
- Test: `src/lib/queries/settle-up-queries.test.ts`, `src/lib/queries/expense-search.test.ts`

**Produces:** `getExpenseById(...).splits: { memberId: string; amount: number }[]`; `getExpenses(...)[i].hasCustomSplit: boolean`.

- [ ] **Step 1: Failing settle-up test** — add a household `h3` in a new `describe`: participants `pa`, `pb`, `pc`; `pa` pays 9000 split `pa:0/pb:6000/pc:3000` (rows only for pb and pc); `pb` pays 3000 unsplit. Expected: equal pool 3000 → 1000 each; nets `pa = 9000 − 1000 = 8000`, `pb = 3000 − (1000 + 6000) = −4000`, `pc = −(1000 + 3000) = −4000`.
- [ ] **Step 2: Implement** in `getSettleUp`, after `paidRows`:

```ts
// Participant-paid expenses WITHOUT split rows form the equal pool …
const [{ equalPoolMinor }] =
  participantIds.length === 0
    ? [{ equalPoolMinor: 0 }]
    : await db
        .select({ equalPoolMinor: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)` })
        .from(expenses)
        .where(
          and(
            eq(expenses.householdId, householdId),
            inArray(expenses.memberId, participantIds),
            notExists(
              db.select({ one: sql`1` }).from(expenseSplits).where(eq(expenseSplits.expenseId, expenses.id)),
            ),
          ),
        );
// … and the rest contribute their explicit shares.
const customShares =
  participantIds.length === 0
    ? []
    : await db
        .select({
          memberId: expenseSplits.memberId,
          shareMinor: sql<number>`coalesce(sum(${expenseSplits.shareMinor}), 0)`,
        })
        .from(expenseSplits)
        .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
        .where(and(eq(expenses.householdId, householdId), inArray(expenses.memberId, participantIds)))
        .groupBy(expenseSplits.memberId);
```

Pass `equalPoolMinor` and `customShares` into `computeNetBalances`. Import `notExists` from `drizzle-orm` and `expenseSplits` from the schema.

- [ ] **Step 3: Expense queries** — `getExpenseById`: after the row lookup, `const splits = await db.select({ memberId: expenseSplits.memberId, amount: sql<number>\`${expenseSplits.shareMinor} / 100.0\` }).from(expenseSplits).where(eq(expenseSplits.expenseId, id))` and return `{ ...row, splits }`. `getExpenses`: add `hasCustomSplit: sql<number>\`exists(select 1 from ${expenseSplits} where ${expenseSplits.expenseId} = ${expenses.id})\`` to the select and map rows to `{ ...r, hasCustomSplit: r.hasCustomSplit === 1 }`. Add to `expense-search.test.ts`: insert split rows for one expense; expect `hasCustomSplit` true only there; `getExpenseById` returns `splits` with major amounts.
- [ ] **Step 4: Run** `pnpm exec vitest run src/lib/queries` — PASS. Commit `feat(splits): settle-up and expense queries read custom shares`.

---

### Task 4: Actions + FK-safe deletes

**Files:**
- Modify: `src/lib/actions/expense-actions.ts` (create/update/delete handle split rows)
- Modify: `src/lib/actions/household-actions.ts` (`deleteHousehold` deletes split rows first)
- Modify: `src/lib/queries/member-ledger.ts` (splits count as a ledger reference)
- Modify: `src/lib/actions/member-actions.ts` (message for the new reference kind)
- Test: `src/lib/actions/expense-splits.test.ts` (new), `src/lib/actions/scoping.test.ts` (household delete), `src/lib/members.test.ts` or the member-actions test that covers `deleteMember`

**Consumes:** `parseSplitsField`, `expenseSplits`.

- [ ] **Step 1: Failing action tests** — `expense-splits.test.ts` (copy the cookie/actor mocks from `settlement-actions.test.ts`; seed `h1` with participants `ma`, `mb`, excluded `mx`, category `c1`, and a second household `h2` with member `o1`):
  - `createExpense` with `splits=[{ma:4},{mb:6}]` for amount `10` → rows exist with `shareMinor` 400/600; activity summary ends with `(custom split)`.
  - `createExpense` with `splits` naming `o1` → `{ error: "Everyone in a split must be in settle-up for this household" }`; no expense inserted.
  - `createExpense` with `splits` naming `mx` (excluded) → same error.
  - `createExpense` with shares summing to `9.99` → `{ error: "Split amounts must add up to the expense amount" }`.
  - `updateExpense` from custom to no `splits` field → rows deleted; from equal to custom → rows inserted; custom → different custom → rows replaced (no duplicates).
  - `deleteExpense` on a split expense → no FK error, rows gone.
- [ ] **Step 2: Implement** — in `expense-actions.ts`:

```ts
/** Every split member must be a settle-up participant of THIS household. */
async function checkSplitMembers(householdId: string, splits: SplitInput[]): Promise<string | null> {
  const rows = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.includeInSettleUp, true),
        inArray(householdMembers.id, splits.map((s) => s.memberId)),
      ),
    );
  return rows.length === splits.length ? null : "Everyone in a split must be in settle-up for this household";
}

function splitRows(expenseId: string, splits: SplitInput[]) {
  return splits.map((s) => ({ id: createId(), expenseId, memberId: s.memberId, shareMinor: s.shareMinor }));
}
```

In `createExpense`: after `amountMinor`, `const split = parseSplitsField(formData.get("splits"), amountMinor); if ("error" in split) return { error: split.error };` then `if (split.splits) { const err = await checkSplitMembers(household.id, split.splits); if (err) return { error: err }; }`. Replace the single insert with `const expenseId = createId();` and, when there are splits, `await db.batch([db.insert(expenses).values({ id: expenseId, … }), db.insert(expenseSplits).values(splitRows(expenseId, split.splits))])`, else the plain insert. Summary: `` `added "${desc}" ₹${amount}${split.splits ? " (custom split)" : ""}` ``.

In `updateExpense`: same parse + member check; then

```ts
const [existing] = await db.select({ id: expenses.id }).from(expenses)
  .where(and(eq(expenses.id, id), eq(expenses.householdId, household.id))).limit(1);
if (!existing) return { error: "Expense not found" };
const statements = [
  db.update(expenses).set({ …, updatedAt: new Date() }).where(eq(expenses.id, id)),
  db.delete(expenseSplits).where(eq(expenseSplits.expenseId, id)),
];
if (split.splits) statements.push(db.insert(expenseSplits).values(splitRows(id, split.splits)));
await db.batch(statements as [typeof statements[0], ...typeof statements]);
```

In `deleteExpense`: check existence (scoped) first, then `db.batch([db.delete(expenseSplits).where(eq(expenseSplits.expenseId, id)), db.delete(expenses).where(eq(expenses.id, id))])`.

- [ ] **Step 3: Household delete** — in `deleteHousehold`'s batch, first statement: `db.delete(expenseSplits).where(inArray(expenseSplits.expenseId, db.select({ id: expenses.id }).from(expenses).where(eq(expenses.householdId, id))))`. Extend the existing `deleteHousehold` scoping test: seed a split row in the household being deleted; expect success.
- [ ] **Step 4: Member ledger** — `LedgerReference` gains `"splits"`; after the expenses check: `const [split] = await db.select({ id: expenseSplits.id }).from(expenseSplits).where(eq(expenseSplits.memberId, memberId)).limit(1); if (split) return "splits";`. In `deleteMember`'s message switch add a case: `"This member is part of a custom split. Edit those expenses first."`. Add a test in the member-actions test file that already covers `memberLedgerReference`.
- [ ] **Step 5: Run** `pnpm exec tsc --noEmit && pnpm test` — PASS. Commit `feat(splits): expense actions write, replace and delete split rows`.

---

### Task 5: Form UI + list badge

**Files:**
- Modify: `src/components/expenses/expense-form.tsx` (Split section; controlled amount)
- Create: `src/components/expenses/split-editor.tsx` (the per-member rows)
- Modify: `src/components/expenses/expense-row.tsx`, `expense-list.tsx` (optional `hasCustomSplit` → "Split" badge)
- Modify: `src/app/(app)/expenses/[id]/edit/page.tsx` (passes `splits` through — already on the query row)
- Test: `src/components/expenses/expense-form.test.tsx`, `src/components/expenses/split-editor.test.tsx`

**Behavior:**
- Section "Split" under "Paid by": two pills `Equally` (default) / `Custom` (`aria-pressed`). Participants = `members.filter(m => m.includeInSettleUp)`. When there are fewer than two participants the section is hidden (nothing to split).
- Custom shows one row per participant: a native checkbox (included) + a number input (share, major units, disabled when unchecked), all ≥44px rows. Entering Custom, toggling a checkbox, or changing the total re-distributes the total equally among the checked people (integer minor units, remainder by id order — reuse `computeShares` from `@/lib/settle-up/balances`). Editing one share changes only that share. A "Remaining" line shows `total − Σ shares`; when it is not zero the submit button is disabled and the line is `text-destructive`.
- Hidden `<input type="hidden" name="splits" value={JSON.stringify(rows)}>` rendered only in Custom mode, rows = checked people as `{ memberId, amount }` (major-unit strings).
- Editing an expense whose `splits` is non-empty opens in Custom with the saved shares checked.
- Amount becomes a controlled input so the editor can react to it (`value`/`onChange`; the e2e `fill` still works).

- [ ] **Step 1: Failing form tests** — add to `expense-form.test.tsx` (members need `includeInSettleUp`):
  - default renders no hidden `splits` input and "Equally" is pressed;
  - clicking "Custom" with amount `9` and two participants shows two share inputs valued `4.5` each and "Remaining" 0;
  - rendering with `expense.splits=[{memberId:"a",amount:3},{memberId:"c",amount:7}]` starts in Custom with those values.
- [ ] **Step 2: Implement `SplitEditor`** (client): props `{ participants: {id,name}[]; totalMajor: number; value: Record<string,string>; included: Set<string>; onChange(next: {value, included}) }`; renders rows + remaining; exports a pure `distributeEqually(totalMajor, ids): Record<string,string>` (via `computeShares(toMinorUnits(total), ids)` → `(minor/100).toFixed(2)`), tested in `split-editor.test.ts` for the remainder case (`10` over three → `3.34/3.33/3.33`).
- [ ] **Step 3: Wire into `ExpenseForm`** and add the badge: `ExpenseRowItem.hasCustomSplit?: boolean` → after the member name render `<Badge variant="outline" className="ml-2">Split</Badge>`.
- [ ] **Step 4: Run** `pnpm exec vitest run src/components/expenses && pnpm exec tsc --noEmit && pnpm lint` — PASS. Commit `feat(expenses): split an expense unevenly or among some people`.

---

### Task 6: Docs, graph, PR

- [ ] `FEATURES.md` "Settle up" section: add "Split any expense unevenly or among just some people — choose Custom when adding or editing it. Everything else stays split equally." plus the three polish items from the sibling branch (edit a recorded payment; filter the activity feed by who did it; unread notifications are highlighted).
- [ ] Spec: under "Future extension" add one line `> Implemented 2026-09-28 — see docs/superpowers/plans/2026-09-28-custom-splits.md.`
- [ ] `memory.md`: dated work-log entry (what/why/decisions: `share_minor` exact amounts, no weights; rows only for custom; participants-only validation; `(custom split)` in summaries), update "Current state & open items" (deferred list closed; note both PRs).
- [ ] `graphify update .`
- [ ] Full gate incl. production build; push `feat/custom-splits`; open the PR with a body covering the data model, the math change, validation rules, and the manual checks. End with the attribution line from the session reminder. After merge the prod build applies migration `0009` automatically (`scripts/migrate-if-prod.mjs`).
