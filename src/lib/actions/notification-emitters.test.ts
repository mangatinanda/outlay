import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return new Map<string, string>();
});
const actorState = vi.hoisted(() => ({ actor: null as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createExpense } from "@/lib/actions/expense-actions";
import { createSettlement } from "@/lib/actions/settlement-actions";
import { db } from "@/lib/db";
import {
  categories,
  householdMembers,
  households,
  notifications,
  users,
} from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

const ALICE = { kind: "user", userId: "u1", email: "alice@x.com" } as const;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values([
    { id: "u1", name: "Alice", email: "alice@x.com" },
    { id: "u2", name: "Bob", email: "bob@x.com" },
  ]);
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db.insert(householdMembers).values([
    // Alice + Bob are linked; Cook is attribution-only (no account).
    {
      id: "mA",
      householdId: "h1",
      userId: "u1",
      email: "alice@x.com",
      name: "Alice",
      role: "admin",
    },
    {
      id: "mB",
      householdId: "h1",
      userId: "u2",
      email: "bob@x.com",
      name: "Bob",
      role: "member",
    },
    { id: "mC", householdId: "h1", name: "Cook", role: "member" },
  ]);
  await db.insert(categories).values({
    id: "c1",
    householdId: "h1",
    name: "General",
  });
});

beforeEach(async () => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = ALICE;
  await db.delete(notifications);
  await db
    .update(households)
    .set({ notifyExpenseOverMinor: null })
    .where(eq(households.id, "h1"));
});

function settlementForm(from: string, to: string) {
  const fd = new FormData();
  fd.set("fromMemberId", from);
  fd.set("toMemberId", to);
  fd.set("amount", "50");
  fd.set("date", "2026-07-07");
  return fd;
}

function expenseForm(amount: string) {
  const fd = new FormData();
  fd.set("amount", amount);
  fd.set("description", "Groceries");
  fd.set("categoryId", "c1");
  fd.set("memberId", "mA");
  fd.set("date", "2026-07-07");
  return fd;
}

describe("createSettlement → settlement.recorded", () => {
  it("notifies the linked counterparty, not the actor", async () => {
    const result = await createSettlement(settlementForm("mA", "mB"));
    expect(result).toEqual({ success: true });
    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("u2");
    expect(rows[0].type).toBe("settlement.recorded");
    const payload = JSON.parse(rows[0].payload);
    expect(payload.amountMinor).toBe(5000);
    expect(payload.currency).toBe("INR");
    expect(payload.fromName).toBe("Alice");
    expect(payload.toName).toBe("Bob");
  });

  it("stays silent when the counterparty has no account", async () => {
    await createSettlement(settlementForm("mA", "mC"));
    expect(await db.select().from(notifications)).toHaveLength(0);
  });
});

describe("createExpense → expense.large", () => {
  it("does not emit when the threshold is off", async () => {
    await createExpense(expenseForm("999"));
    expect(await db.select().from(notifications)).toHaveLength(0);
  });

  it("notifies other linked members at/above the threshold", async () => {
    await db
      .update(households)
      .set({ notifyExpenseOverMinor: 50000 }) // ₹500
      .where(eq(households.id, "h1"));
    await createExpense(expenseForm("500")); // exactly at the boundary
    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(1); // Bob only — not Alice (actor), not Cook
    expect(rows[0].userId).toBe("u2");
    expect(rows[0].type).toBe("expense.large");
    const payload = JSON.parse(rows[0].payload);
    expect(payload.description).toBe("Groceries");
    expect(payload.actorLabel).toBe("Alice");
  });

  it("stays silent below the threshold", async () => {
    await db
      .update(households)
      .set({ notifyExpenseOverMinor: 50000 })
      .where(eq(households.id, "h1"));
    await createExpense(expenseForm("499.99"));
    expect(await db.select().from(notifications)).toHaveLength(0);
  });
});
