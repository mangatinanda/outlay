/**
 * Integration test for importExpenses: member/category resolution + creation,
 * idempotent dedupe, and the per-household expense cap. Real in-memory libSQL
 * with the project's migrations; only next/headers, next/cache, and the actor
 * resolver are mocked.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  process.env.MAX_EXPENSES_PER_HOUSEHOLD = "3"; // tiny cap to exercise overLimit
  return new Map<string, string>();
});
const actorState = vi.hoisted(() => ({
  actor: { kind: "superadmin" } as unknown,
}));

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

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { importExpenses } from "@/lib/actions/import-actions";
import { db } from "@/lib/db";
import {
  categories,
  expenses,
  householdMembers,
  households,
} from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "imp-hh", name: "Ontillu Home" });
  cookieJar.set(HOUSEHOLD_COOKIE, "imp-hh");
});

const baseRows = [
  {
    date: "2025-11-20",
    amount: 1500,
    description: "Tractor - Janardhan",
    notes: "Card",
    categoryName: "Farming",
    memberEmail: "nanda@x.com",
  },
  {
    date: "2025-12-13",
    amount: 5000,
    description: "Groundnuts purchase",
    notes: "UPI",
    categoryName: "Farming",
    memberEmail: "siva@x.com",
  },
];

const resolutions = [
  { email: "nanda@x.com", newName: "Nanda" },
  { email: "siva@x.com", newName: "Siva" },
];

describe("importExpenses", () => {
  it("creates members + categories and imports rows", async () => {
    const res = await importExpenses({
      rows: baseRows,
      memberResolutions: resolutions,
    });
    expect(res).toMatchObject({
      success: true,
      imported: 2,
      duplicates: 0,
      overLimit: 0,
    });

    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, "imp-hh"));
    expect(members.map((m) => m.name).sort()).toEqual(["Nanda", "Siva"]);
    // Import-created members are attribution-only (email NOT persisted): a
    // CSV-supplied email must not become sign-in-eligible via canSignIn.
    expect(members.find((m) => m.name === "Nanda")?.email).toBeNull();

    const cats = await db
      .select()
      .from(categories)
      .where(eq(categories.householdId, "imp-hh"));
    expect(cats.map((c) => c.name)).toContain("Farming");

    const rows = await db
      .select()
      .from(expenses)
      .where(eq(expenses.householdId, "imp-hh"));
    expect(rows).toHaveLength(2);
    expect(
      rows.find((e) => e.description === "Tractor - Janardhan")?.amountMinor,
    ).toBe(150000);
  });

  it("is idempotent: re-running the same rows skips duplicates", async () => {
    const res = await importExpenses({
      rows: baseRows,
      memberResolutions: resolutions,
    });
    expect(res).toMatchObject({ success: true, imported: 0, duplicates: 2 });
    // Members/categories were reused, not duplicated.
    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, "imp-hh"));
    expect(members).toHaveLength(2);
  });

  it("honours the per-household cap (overLimit)", async () => {
    // Already 2 imported; cap is 3. Two new unique rows -> 1 fits, 1 over limit.
    const more = [
      {
        date: "2026-01-08",
        amount: 5800,
        description: "Tractor petrol",
        notes: "Card",
        categoryName: "Farming",
        memberEmail: "nanda@x.com",
      },
      {
        date: "2026-02-06",
        amount: 9200,
        description: "Canara bank loan renewal",
        notes: "UPI",
        categoryName: "Other",
        memberEmail: "siva@x.com",
      },
    ];
    const res = await importExpenses({
      rows: more,
      memberResolutions: resolutions,
    });
    expect(res).toMatchObject({ success: true, imported: 1, overLimit: 1 });
    const rows = await db
      .select()
      .from(expenses)
      .where(eq(expenses.householdId, "imp-hh"));
    expect(rows).toHaveLength(3); // capped
  });

  it("maps rows to an existing member by id (fresh household, no dupes)", async () => {
    // A separate household with one pre-existing member, made active.
    await db.insert(households).values({ id: "imp-hh2", name: "Other Home" });
    const existingId = createId();
    await db.insert(householdMembers).values({
      id: existingId,
      householdId: "imp-hh2",
      name: "Existing Person",
      email: "person@x.com",
      role: "admin",
    });
    cookieJar.set(HOUSEHOLD_COOKIE, "imp-hh2");

    const res = await importExpenses({
      rows: [
        {
          date: "2026-03-01",
          amount: 100,
          description: "Mapped by id",
          notes: "",
          categoryName: "Other",
          memberEmail: "person@x.com",
        },
      ],
      memberResolutions: [{ email: "person@x.com", memberId: existingId }],
    });
    expect(res).toMatchObject({ success: true, imported: 1 });

    const [row] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.householdId, "imp-hh2"));
    expect(row.memberId).toBe(existingId);
    // No new member was created.
    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, "imp-hh2"));
    expect(members).toHaveLength(1);
  });

  it("keeps two contributors' same-day/amount/description expenses distinct", async () => {
    await db.insert(households).values({ id: "imp-hh3", name: "Dedupe Home" });
    cookieJar.set(HOUSEHOLD_COOKIE, "imp-hh3");
    const sameRow = (email: string) => ({
      date: "2026-06-01",
      amount: 100,
      description: "Groceries",
      notes: "",
      categoryName: "Shopping",
      memberEmail: email,
    });
    const res = await importExpenses({
      rows: [sameRow("a@x.com"), sameRow("b@x.com")],
      memberResolutions: [
        { email: "a@x.com", newName: "Aaa" },
        { email: "b@x.com", newName: "Bbb" },
      ],
    });
    // Same date/amount/description but DIFFERENT members → both import, not deduped.
    expect(res).toMatchObject({ success: true, imported: 2, duplicates: 0 });
    const rows = await db
      .select()
      .from(expenses)
      .where(eq(expenses.householdId, "imp-hh3"));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.memberId)).size).toBe(2);
  });
});
