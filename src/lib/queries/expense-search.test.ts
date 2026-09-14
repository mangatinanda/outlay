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
} from "@/lib/db/schema";
import { getExpenses } from "@/lib/queries/expense-queries";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values([
    { id: "h1", name: "Home" },
    { id: "h2", name: "Other" },
  ]);
  await db.insert(householdMembers).values([
    { id: "m1", householdId: "h1", name: "Amma", role: "admin" },
    { id: "m2", householdId: "h2", name: "Someone", role: "admin" },
  ]);
  await db.insert(categories).values([
    { id: "c1", householdId: "h1", name: "Home" },
    { id: "c2", householdId: "h2", name: "Home" },
  ]);
  await db.insert(expenses).values([
    {
      id: "e1",
      householdId: "h1",
      categoryId: "c1",
      memberId: "m1",
      amountMinor: 100000,
      description: "New Sofa",
      date: "2026-01-10",
    },
    {
      id: "e2",
      householdId: "h1",
      categoryId: "c1",
      memberId: "m1",
      amountMinor: 5000,
      description: "sofa cover",
      date: "2026-02-10",
    },
    {
      id: "e3",
      householdId: "h1",
      categoryId: "c1",
      memberId: "m1",
      amountMinor: 2000,
      description: "Groceries 100% fresh",
      date: "2026-03-10",
    },
    {
      id: "e4",
      householdId: "h2",
      categoryId: "c2",
      memberId: "m2",
      amountMinor: 9000,
      description: "sofa in another household",
      date: "2026-01-11",
    },
  ]);
});

describe("getExpenses search", () => {
  it("matches the description case-insensitively", async () => {
    const rows = await getExpenses("h1", { search: "sofa" });
    expect(rows.map((r) => r.id).sort()).toEqual(["e1", "e2"]);
  });

  it("never leaks another household's match", async () => {
    const rows = await getExpenses("h1", { search: "another household" });
    expect(rows).toHaveLength(0);
  });

  it("treats LIKE wildcards as literal text", async () => {
    // "%" must find the groceries row, not match everything.
    const rows = await getExpenses("h1", { search: "100%" });
    expect(rows.map((r) => r.id)).toEqual(["e3"]);
  });

  it("combines search with the other filters", async () => {
    const rows = await getExpenses("h1", {
      search: "sofa",
      startDate: "2026-02-01",
    });
    expect(rows.map((r) => r.id)).toEqual(["e2"]);
  });

  it("is a no-op when the search is blank", async () => {
    const rows = await getExpenses("h1", { search: "   " });
    expect(rows).toHaveLength(3);
  });
});
