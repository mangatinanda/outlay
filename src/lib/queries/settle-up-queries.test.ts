import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
});

import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import {
  categories,
  expenseSplits,
  expenses,
  householdMembers,
  households,
  settlements,
} from "@/lib/db/schema";
import { getSettlements, getSettleUp } from "@/lib/queries/settle-up-queries";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "h1", name: "Home" });
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
  ]);
  await db
    .insert(categories)
    .values({ id: "c1", householdId: "h1", name: "Cat" });
  // A paid 6000, B paid 0; X (excluded) paid 5000 → ignored.
  await db.insert(expenses).values([
    {
      id: "e1",
      householdId: "h1",
      categoryId: "c1",
      memberId: "ma",
      amountMinor: 600000,
      description: "A",
      date: "2026-06-01",
    },
    {
      id: "e2",
      householdId: "h1",
      categoryId: "c1",
      memberId: "mx",
      amountMinor: 500000,
      description: "X",
      date: "2026-06-01",
    },
  ]);
});

describe("getSettleUp", () => {
  it("computes net balances over participants only, in major units", async () => {
    const res = await getSettleUp("h1");
    const byId = Object.fromEntries(
      res.balances.map((b) => [b.memberId, b.net]),
    );
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
      id: "s1",
      householdId: "h1",
      fromMemberId: "mb",
      toMemberId: "ma",
      amountMinor: 300000,
      date: "2026-06-02",
    });
    const res = await getSettleUp("h1");
    expect(res.settledUp).toBe(true);
    expect(res.suggestions).toEqual([]);
  });

  it("getSettlements lists history with names + major amounts", async () => {
    await db.insert(households).values({ id: "h9", name: "Hist" });
    await db.insert(householdMembers).values([
      { id: "p1", householdId: "h9", name: "P1", role: "admin" },
      { id: "p2", householdId: "h9", name: "P2", role: "member" },
    ]);
    await db.insert(settlements).values({
      id: "set9",
      householdId: "h9",
      fromMemberId: "p2",
      toMemberId: "p1",
      amountMinor: 45000,
      date: "2026-06-03",
      note: "UPI",
    });
    const rows = await getSettlements("h9");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fromMemberId: "p2",
      toMemberId: "p1",
      fromName: "P2",
      toName: "P1",
      amount: 450,
      date: "2026-06-03",
      note: "UPI",
    });
  });
});

describe("getSettleUp with custom splits", () => {
  beforeAll(async () => {
    await db.insert(households).values({ id: "h3", name: "Split" });
    await db.insert(householdMembers).values([
      { id: "pa", householdId: "h3", name: "PA", role: "admin" },
      { id: "pb", householdId: "h3", name: "PB", role: "member" },
      { id: "pc", householdId: "h3", name: "PC", role: "member" },
    ]);
    await db
      .insert(categories)
      .values({ id: "c3", householdId: "h3", name: "Cat" });
    // PA paid 9000 split PB:6000 / PC:3000 (PA owes nothing on it);
    // PB paid 3000 with no split rows → the equal pool (1000 each).
    await db.insert(expenses).values([
      {
        id: "e3a",
        householdId: "h3",
        categoryId: "c3",
        memberId: "pa",
        amountMinor: 900000,
        description: "Split dinner",
        date: "2026-06-01",
      },
      {
        id: "e3b",
        householdId: "h3",
        categoryId: "c3",
        memberId: "pb",
        amountMinor: 300000,
        description: "Groceries",
        date: "2026-06-02",
      },
    ]);
    await db.insert(expenseSplits).values([
      { id: "sp1", expenseId: "e3a", memberId: "pb", shareMinor: 600000 },
      { id: "sp2", expenseId: "e3a", memberId: "pc", shareMinor: 300000 },
    ]);
  });

  it("charges explicit shares for split expenses and equal shares for the rest", async () => {
    const res = await getSettleUp("h3");
    const byId = Object.fromEntries(
      res.balances.map((b) => [b.memberId, b.net]),
    );
    expect(byId.pa).toBe(9000 - 1000);
    expect(byId.pb).toBe(3000 - (1000 + 6000));
    expect(byId.pc).toBe(-(1000 + 3000));
    expect(res.settledUp).toBe(false);
  });
});
