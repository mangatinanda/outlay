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
      fromName: "P2",
      toName: "P1",
      amount: 450,
      date: "2026-06-03",
      note: "UPI",
    });
  });
});
