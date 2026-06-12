/**
 * Integration tests for household scoping: every mutation must refuse ids
 * that belong to a household other than the active one, and createExpense /
 * updateExpense must refuse foreign categoryId / memberId references.
 *
 * Runs against a real in-memory libSQL database with the project's actual
 * migrations; only next/headers (cookies) and next/cache are mocked.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return new Map<string, string>();
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name)
        ? { name, value: cookieJar.get(name)! }
        : undefined,
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import {
  households,
  householdMembers,
  categories,
  expenses,
} from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";
import { getExpenseById } from "@/lib/queries/expense-queries";
import {
  createExpense,
  updateExpense,
  deleteExpense,
} from "@/lib/actions/expense-actions";
import { updateCategory, deleteCategory } from "@/lib/actions/category-actions";
import { updateMember, deleteMember } from "@/lib/actions/member-actions";
import {
  renameHousehold,
  deleteHousehold,
} from "@/lib/actions/household-actions";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const validExpenseForm = () =>
  form({
    amount: "10.50",
    description: "Test expense",
    categoryId: "cat-a",
    memberId: "mem-a",
    date: "2026-06-11",
    notes: "",
  });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });

  await db.insert(households).values([
    { id: "hh-a", name: "Home A" },
    { id: "hh-b", name: "Home B" },
  ]);
  await db.insert(householdMembers).values([
    { id: "mem-a", householdId: "hh-a", name: "Alice", role: "admin" },
    { id: "mem-b", householdId: "hh-b", name: "Bob", role: "admin" },
  ]);
  await db.insert(categories).values([
    { id: "cat-a", householdId: "hh-a", name: "Groceries A" },
    { id: "cat-b", householdId: "hh-b", name: "Groceries B" },
  ]);
  await db.insert(expenses).values([
    {
      id: "exp-a",
      householdId: "hh-a",
      categoryId: "cat-a",
      memberId: "mem-a",
      amountMinor: 5000,
      description: "A's expense",
      date: "2026-06-01",
    },
    {
      id: "exp-b",
      householdId: "hh-b",
      categoryId: "cat-b",
      memberId: "mem-b",
      amountMinor: 7500,
      description: "B's expense",
      date: "2026-06-01",
    },
  ]);

  // Household A is the active household for every test.
  cookieJar.set(HOUSEHOLD_COOKIE, "hh-a");
});

describe("createExpense ownership checks", () => {
  it("rejects a category from another household", async () => {
    const fd = validExpenseForm();
    fd.set("categoryId", "cat-b");
    const result = await createExpense(fd);
    expect(result.error).toBeTruthy();
  });

  it("rejects a member from another household", async () => {
    const fd = validExpenseForm();
    fd.set("memberId", "mem-b");
    const result = await createExpense(fd);
    expect(result.error).toBeTruthy();
  });

  it("accepts the active household's own category and member", async () => {
    const result = await createExpense(validExpenseForm());
    expect(result).toEqual({ success: true });
    const rows = await db
      .select()
      .from(expenses)
      .where(eq(expenses.description, "Test expense"));
    expect(rows).toHaveLength(1);
    expect(rows[0].householdId).toBe("hh-a");
    expect(rows[0].amountMinor).toBe(1050); // "10.50" stored as integer minor units
  });
});

describe("expense mutations are household-scoped", () => {
  it("updateExpense refuses an expense from another household", async () => {
    const result = await updateExpense("exp-b", validExpenseForm());
    expect(result.error).toBeTruthy();
    const [row] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, "exp-b"));
    expect(row.description).toBe("B's expense");
  });

  it("updateExpense refuses a foreign categoryId on an own expense", async () => {
    const fd = validExpenseForm();
    fd.set("categoryId", "cat-b");
    const result = await updateExpense("exp-a", fd);
    expect(result.error).toBeTruthy();
  });

  it("updateExpense updates an own expense", async () => {
    const fd = validExpenseForm();
    fd.set("description", "A's expense (edited)");
    const result = await updateExpense("exp-a", fd);
    expect(result).toEqual({ success: true });
    const [row] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, "exp-a"));
    expect(row.description).toBe("A's expense (edited)");
  });

  it("deleteExpense refuses an expense from another household", async () => {
    const result = await deleteExpense("exp-b");
    expect(result.error).toBeTruthy();
    const rows = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, "exp-b"));
    expect(rows).toHaveLength(1);
  });
});

describe("category mutations are household-scoped", () => {
  it("updateCategory refuses a category from another household", async () => {
    const result = await updateCategory(
      "cat-b",
      form({ name: "Hijacked", icon: "zap", color: "#22c55e" }),
    );
    expect(result.error).toBeTruthy();
    const [row] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, "cat-b"));
    expect(row.name).toBe("Groceries B");
  });

  it("deleteCategory refuses a category from another household", async () => {
    const result = await deleteCategory("cat-b");
    expect(result.error).toBeTruthy();
    expect(
      await db.select().from(categories).where(eq(categories.id, "cat-b")),
    ).toHaveLength(1);
  });

  it("deleteCategory still blocks an own category that has expenses", async () => {
    const result = await deleteCategory("cat-a");
    expect(result.error).toMatch(/expenses/i);
  });
});

describe("member mutations are household-scoped", () => {
  it("updateMember refuses a member from another household", async () => {
    const result = await updateMember(
      "mem-b",
      form({ name: "Hijacked", role: "member" }),
    );
    expect(result.error).toBeTruthy();
    const [row] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, "mem-b"));
    expect(row.name).toBe("Bob");
  });

  it("deleteMember refuses a member from another household", async () => {
    const result = await deleteMember("mem-b");
    expect(result.error).toBeTruthy();
    expect(
      await db
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.id, "mem-b")),
    ).toHaveLength(1);
  });
});

describe("household mutations validate the target id", () => {
  it("renameHousehold refuses an unknown household", async () => {
    const result = await renameHousehold("nope", form({ name: "X" }));
    expect(result.error).toBeTruthy();
  });

  it("deleteHousehold refuses an unknown household", async () => {
    const result = await deleteHousehold("nope");
    expect(result.error).toBeTruthy();
  });
});

describe("getExpenseById is household-scoped", () => {
  it("returns null for an expense outside the given household", async () => {
    expect(await getExpenseById("exp-b", "hh-a")).toBeNull();
  });

  it("returns the expense inside its own household", async () => {
    const row = await getExpenseById("exp-b", "hh-b");
    expect(row?.id).toBe("exp-b");
  });
});
