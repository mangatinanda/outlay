/**
 * Integration tests for the abuse guardrails (src/lib/limits.ts): a user
 * cannot exceed MAX_HOUSEHOLDS_PER_USER and a household cannot exceed
 * MAX_EXPENSES_PER_HOUSEHOLD. Both caps are set tiny here via env so the
 * boundary is cheap to hit. Runs against a real in-memory libSQL DB with the
 * project's migrations; only next/headers, next/cache, and the actor resolver
 * are mocked.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  process.env.MAX_HOUSEHOLDS_PER_USER = "2";
  process.env.MAX_EXPENSES_PER_HOUSEHOLD = "2";
  return new Map<string, string>();
});
const actorState = vi.hoisted(() => ({ actor: null as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createExpense } from "@/lib/actions/expense-actions";
import { createHousehold } from "@/lib/actions/household-actions";
import { db } from "@/lib/db";
import {
  categories,
  expenses,
  householdMembers,
  households,
  users,
} from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });

  await db.insert(users).values([
    { id: "u-cap", name: "Cap", email: "cap@x.com" },
    { id: "u-free", name: "Free", email: "free@x.com" },
  ]);
  await db.insert(households).values([
    { id: "h1", name: "One" },
    { id: "h2", name: "Two" },
    { id: "exp-hh", name: "Expenses" },
  ]);
  await db.insert(householdMembers).values([
    // u-cap already belongs to 2 households (== MAX_HOUSEHOLDS_PER_USER).
    {
      id: "mc1",
      householdId: "h1",
      userId: "u-cap",
      name: "Cap",
      role: "admin",
    },
    {
      id: "mc2",
      householdId: "h2",
      userId: "u-cap",
      name: "Cap",
      role: "admin",
    },
    // The expense-cap fixture household with one member.
    { id: "me", householdId: "exp-hh", name: "Me", role: "admin" },
  ]);
  await db
    .insert(categories)
    .values({ id: "cat-e", householdId: "exp-hh", name: "Groceries" });
  // One pre-existing expense; the per-household cap is 2.
  await db.insert(expenses).values({
    id: "e1",
    householdId: "exp-hh",
    categoryId: "cat-e",
    memberId: "me",
    amountMinor: 1000,
    description: "Seed",
    date: "2026-06-01",
  });
});

beforeEach(() => {
  cookieJar.clear();
});

describe("createHousehold per-user cap", () => {
  it("blocks a user already at MAX_HOUSEHOLDS_PER_USER", async () => {
    actorState.actor = { kind: "user", userId: "u-cap", email: "cap@x.com" };
    const result = await createHousehold(
      form({ name: "Third", currency: "INR" }),
    );
    expect(result.error).toMatch(/limit of 2 households/i);
    const rows = await db
      .select()
      .from(households)
      .where(eq(households.name, "Third"));
    expect(rows).toHaveLength(0); // nothing was created
  });

  it("allows a user below the cap", async () => {
    actorState.actor = { kind: "user", userId: "u-free", email: "free@x.com" };
    const result = await createHousehold(
      form({ name: "First", currency: "INR" }),
    );
    expect(result).toEqual({ success: true });
  });
});

describe("createExpense per-household cap", () => {
  it("admits expenses up to MAX_EXPENSES_PER_HOUSEHOLD, then blocks", async () => {
    actorState.actor = { kind: "superadmin" };
    cookieJar.set(HOUSEHOLD_COOKIE, "exp-hh");
    const expense = () =>
      form({
        amount: "5.00",
        description: "X",
        categoryId: "cat-e",
        memberId: "me",
        date: "2026-06-02",
        notes: "",
      });

    // 1 existing < cap of 2 -> admitted (household now holds 2).
    expect(await createExpense(expense())).toEqual({ success: true });
    // 2 >= cap -> blocked.
    const blocked = await createExpense(expense());
    expect(blocked.error).toMatch(/limit of 2 expenses/i);

    const all = await db
      .select()
      .from(expenses)
      .where(eq(expenses.householdId, "exp-hh"));
    expect(all).toHaveLength(2);
  });
});
