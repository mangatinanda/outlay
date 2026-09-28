/**
 * Custom splits through the expense actions: shares are written with the
 * expense, replaced on edit, removed on delete, and every split member must
 * be a settle-up participant of the active household.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return new Map<string, string>();
});
const actorState = vi.hoisted(() => ({
  actor: { kind: "superadmin" } as unknown,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) =>
      cookieJar.has(n) ? { name: n, value: cookieJar.get(n)! } : undefined,
    set: (n: string, v: string) => void cookieJar.set(n, v),
    delete: (n: string) => void cookieJar.delete(n),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  createExpense,
  deleteExpense,
  updateExpense,
} from "@/lib/actions/expense-actions";
import { db } from "@/lib/db";
import {
  activity,
  categories,
  expenseSplits,
  expenses,
  householdMembers,
  households,
} from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function expenseForm(
  description: string,
  amount: string,
  splits?: { memberId: string; amount: string }[],
) {
  return form({
    amount,
    description,
    categoryId: "c1",
    memberId: "ma",
    date: "2026-09-01",
    ...(splits ? { splits: JSON.stringify(splits) } : {}),
  });
}

async function expenseByDescription(description: string) {
  const [row] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.description, description));
  return row?.id ?? null;
}

async function sharesOf(expenseId: string) {
  const rows = await db
    .select({
      memberId: expenseSplits.memberId,
      shareMinor: expenseSplits.shareMinor,
    })
    .from(expenseSplits)
    .where(eq(expenseSplits.expenseId, expenseId))
    .orderBy(expenseSplits.memberId);
  return rows;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values([
    { id: "h1", name: "Home" },
    { id: "h2", name: "Other" },
  ]);
  await db.insert(householdMembers).values([
    { id: "ma", householdId: "h1", name: "A", role: "admin" },
    { id: "mb", householdId: "h1", name: "B", role: "member" },
    {
      id: "mx",
      householdId: "h1",
      name: "X",
      role: "member",
      includeInSettleUp: false,
    },
    { id: "o1", householdId: "h2", name: "O1", role: "admin" },
  ]);
  await db.insert(categories).values([
    { id: "c1", householdId: "h1", name: "Cat" },
    { id: "c2", householdId: "h2", name: "Cat" },
  ]);
});

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = { kind: "superadmin" };
});

describe("createExpense with a custom split", () => {
  it("stores one share row per person and marks the activity summary", async () => {
    const res = await createExpense(
      expenseForm("Dinner", "10", [
        { memberId: "ma", amount: "4" },
        { memberId: "mb", amount: "6" },
      ]),
    );
    expect(res).toEqual({ success: true });
    const id = await expenseByDescription("Dinner");
    expect(id).not.toBeNull();
    expect(await sharesOf(id!)).toEqual([
      { memberId: "ma", shareMinor: 400 },
      { memberId: "mb", shareMinor: 600 },
    ]);
    const [log] = await db
      .select({ summary: activity.summary })
      .from(activity)
      .where(eq(activity.action, "expense.create"));
    expect(log.summary).toBe('added "Dinner" ₹10 (custom split)');
  });

  it("refuses a member from another household", async () => {
    const res = await createExpense(
      expenseForm("Foreign", "10", [
        { memberId: "ma", amount: "5" },
        { memberId: "o1", amount: "5" },
      ]),
    );
    expect(res).toEqual({
      error: "Everyone in a split must be in settle-up for this household",
    });
    expect(await expenseByDescription("Foreign")).toBeNull();
  });

  it("refuses a member who is not in settle-up", async () => {
    const res = await createExpense(
      expenseForm("Excluded", "10", [
        { memberId: "ma", amount: "5" },
        { memberId: "mx", amount: "5" },
      ]),
    );
    expect(res).toEqual({
      error: "Everyone in a split must be in settle-up for this household",
    });
    expect(await expenseByDescription("Excluded")).toBeNull();
  });

  it("refuses shares that do not add up to the amount", async () => {
    const res = await createExpense(
      expenseForm("Short", "10", [
        { memberId: "ma", amount: "4.99" },
        { memberId: "mb", amount: "5" },
      ]),
    );
    expect(res).toEqual({
      error: "Split amounts must add up to the expense amount",
    });
    expect(await expenseByDescription("Short")).toBeNull();
  });
});

describe("updateExpense and the split rows", () => {
  it("adds shares to an equal-split expense, replaces them, then clears them", async () => {
    expect(await createExpense(expenseForm("Taxi", "30"))).toEqual({
      success: true,
    });
    const id = (await expenseByDescription("Taxi"))!;
    expect(await sharesOf(id)).toEqual([]);

    // equal → custom
    expect(
      await updateExpense(
        id,
        expenseForm("Taxi", "30", [
          { memberId: "ma", amount: "10" },
          { memberId: "mb", amount: "20" },
        ]),
      ),
    ).toEqual({ success: true });
    expect(await sharesOf(id)).toEqual([
      { memberId: "ma", shareMinor: 1000 },
      { memberId: "mb", shareMinor: 2000 },
    ]);

    // custom → a different custom (no leftover or duplicate rows)
    expect(
      await updateExpense(
        id,
        expenseForm("Taxi", "30", [{ memberId: "mb", amount: "30" }]),
      ),
    ).toEqual({ success: true });
    expect(await sharesOf(id)).toEqual([{ memberId: "mb", shareMinor: 3000 }]);

    // custom → equal
    expect(await updateExpense(id, expenseForm("Taxi", "30"))).toEqual({
      success: true,
    });
    expect(await sharesOf(id)).toEqual([]);
  });

  it("refuses to edit an expense from another household", async () => {
    await db.insert(expenses).values({
      id: "e-foreign",
      householdId: "h2",
      categoryId: "c2",
      memberId: "o1",
      amountMinor: 1000,
      description: "Theirs",
      date: "2026-09-01",
    });
    const res = await updateExpense("e-foreign", expenseForm("Theirs", "10"));
    expect(res).toEqual({ error: "Expense not found" });
  });
});

describe("deleteExpense with split rows", () => {
  it("removes the shares with the expense (no FK error)", async () => {
    expect(
      await createExpense(
        expenseForm("Gone", "8", [
          { memberId: "ma", amount: "4" },
          { memberId: "mb", amount: "4" },
        ]),
      ),
    ).toEqual({ success: true });
    const id = (await expenseByDescription("Gone"))!;
    expect(await sharesOf(id)).toHaveLength(2);
    expect(await deleteExpense(id)).toEqual({ success: true });
    expect(await sharesOf(id)).toEqual([]);
    expect(await expenseByDescription("Gone")).toBeNull();
  });

  it("reports a foreign id as not found", async () => {
    expect(await deleteExpense("e-foreign")).toEqual({
      error: "Expense not found",
    });
  });
});
