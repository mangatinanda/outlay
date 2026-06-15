/**
 * Money-math exactness: amounts are stored as integer minor units, so
 * aggregates must be exact — 0.10 + 0.20 is 0.30, not 0.30000000000000004
 * (which is what summing IEEE-754 REALs produces).
 */

import { format } from "date-fns";
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
import {
  getDashboardStats,
  getSpendingByDay,
} from "@/lib/queries/dashboard-queries";
import { getExpenses } from "@/lib/queries/expense-queries";

const today = format(new Date(), "yyyy-MM-dd");

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });

  await db.insert(households).values({ id: "hh", name: "Home" });
  await db
    .insert(householdMembers)
    .values({ id: "mem", householdId: "hh", name: "Me", role: "admin" });
  await db
    .insert(categories)
    .values({ id: "cat", householdId: "hh", name: "Misc" });
  await db.insert(expenses).values([
    {
      id: "e1",
      householdId: "hh",
      categoryId: "cat",
      memberId: "mem",
      amountMinor: 10, // 0.10
      description: "ten paise",
      date: today,
    },
    {
      id: "e2",
      householdId: "hh",
      categoryId: "cat",
      memberId: "mem",
      amountMinor: 20, // 0.20
      description: "twenty paise",
      date: today,
    },
  ]);
});

describe("integer money math", () => {
  it("sums 0.10 + 0.20 to exactly 0.30 in dashboard stats", async () => {
    const stats = await getDashboardStats("hh");
    expect(stats.monthTotal).toBe(0.3);
    expect(stats.monthCount).toBe(2);
  });

  it("returns row amounts in exact major units", async () => {
    const rows = await getExpenses("hh");
    const amounts = rows.map((r) => r.amount).sort();
    expect(amounts).toEqual([0.1, 0.2]);
  });
});

describe("getSpendingByDay", () => {
  it("zero-fills days with no spending across the whole window", async () => {
    const series = await getSpendingByDay("hh", 30);
    expect(series).toHaveLength(31); // window start + 30 days, today inclusive
    expect(series[series.length - 1].date).toBe(today);
    expect(series.find((d) => d.date === today)?.total).toBe(0.3);
    expect(series.filter((d) => d.total === 0)).toHaveLength(30);
  });
});
