import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
});

import { migrate } from "drizzle-orm/libsql/migrator";
import { cleanupAbandonedAccounts } from "@/lib/cleanup";
import { db } from "@/lib/db";
import {
  categories,
  expenses,
  householdMembers,
  households,
  users,
} from "@/lib/db/schema";

const NOW = 1_800_000_000_000; // fixed clock (ms)
const OLD = new Date(NOW - 100 * 86_400_000); // beyond 30-day retention
const RECENT = new Date(NOW - 1 * 86_400_000); // within retention

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });

  await db.insert(users).values([
    { id: "u-abandoned", name: "Abandoned", email: "ab@x.com", createdAt: OLD },
    { id: "u-active", name: "Active", email: "act@x.com", createdAt: OLD },
    { id: "u-recent", name: "Recent", email: "rec@x.com", createdAt: RECENT },
    { id: "u-orphan", name: "Orphan", email: "orph@x.com", createdAt: OLD },
  ]);
  await db.insert(households).values([
    { id: "h-empty", name: "Empty" },
    { id: "h-active", name: "Active" },
    { id: "h-recent", name: "Recent" },
    { id: "h-shared", name: "Shared" },
  ]);
  await db.insert(householdMembers).values([
    {
      id: "m-ab",
      householdId: "h-empty",
      userId: "u-abandoned",
      name: "Abandoned",
      role: "admin",
    },
    {
      id: "m-act",
      householdId: "h-active",
      userId: "u-active",
      name: "Active",
      role: "admin",
    },
    {
      id: "m-rec",
      householdId: "h-recent",
      userId: "u-recent",
      name: "Recent",
      role: "admin",
    },
    {
      id: "m-orph",
      householdId: "h-shared",
      userId: "u-orphan",
      name: "Orphan",
      role: "admin",
    },
    // Attribution-only member (no userId) who owns the shared household's data.
    { id: "m-attr", householdId: "h-shared", name: "Amma", role: "member" },
  ]);
  await db.insert(categories).values([
    { id: "c-active", householdId: "h-active", name: "Groceries" },
    { id: "c-shared", householdId: "h-shared", name: "Groceries" },
  ]);
  await db.insert(expenses).values([
    {
      id: "e-active",
      householdId: "h-active",
      categoryId: "c-active",
      memberId: "m-act",
      amountMinor: 1000,
      description: "Active expense",
      date: "2026-01-01",
    },
    {
      id: "e-shared",
      householdId: "h-shared",
      categoryId: "c-shared",
      memberId: "m-attr", // owned by the attribution member, not the orphan
      amountMinor: 2000,
      description: "Shared expense",
      date: "2026-01-02",
    },
  ]);
});

describe("cleanupAbandonedAccounts", () => {
  it("removes only provably-empty abandoned accounts", async () => {
    const result = await cleanupAbandonedAccounts({
      now: NOW,
      retentionDays: 30,
    });
    // Only u-abandoned is removed. u-orphan is KEPT: it is the sole auth-member
    // of h-shared, whose expense is attributed to an attribution-only member —
    // deleting the owner would orphan that data, so the cleanup must not.
    expect(result).toEqual({ deletedUsers: 1, deletedHouseholds: 1 });

    const remainingUsers = (await db.select().from(users))
      .map((u) => u.id)
      .sort();
    expect(remainingUsers).toEqual(["u-active", "u-orphan", "u-recent"]);

    const remainingHouseholds = (await db.select().from(households))
      .map((h) => h.id)
      .sort();
    // h-empty removed; h-shared kept (has an expense); h-recent kept (recent owner).
    expect(remainingHouseholds).toEqual(["h-active", "h-recent", "h-shared"]);

    // The shared household's data is intact.
    const sharedExpenses = await db.select().from(expenses);
    expect(sharedExpenses.map((e) => e.id).sort()).toEqual([
      "e-active",
      "e-shared",
    ]);
  });

  it("is a no-op on a second run", async () => {
    const result = await cleanupAbandonedAccounts({
      now: NOW,
      retentionDays: 30,
    });
    expect(result).toEqual({ deletedUsers: 0, deletedHouseholds: 0 });
  });
});
