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
import { createExpense } from "@/lib/actions/expense-actions";
import { db } from "@/lib/db";
import {
  activity,
  categories,
  householdMembers,
  households,
} from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db
    .insert(householdMembers)
    .values({ id: "m1", householdId: "h1", name: "Me", role: "admin" });
  await db
    .insert(categories)
    .values({ id: "c1", householdId: "h1", name: "Cat" });
});
beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = { kind: "superadmin" };
});

describe("activity instrumentation", () => {
  it("createExpense appends an expense.create activity row", async () => {
    await createExpense(
      form({
        amount: "10.00",
        description: "Groceries",
        categoryId: "c1",
        memberId: "m1",
        date: "2026-06-01",
        notes: "",
      }),
    );
    const rows = await db
      .select()
      .from(activity)
      .where(eq(activity.action, "expense.create"));
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toContain("Groceries");
  });
});
