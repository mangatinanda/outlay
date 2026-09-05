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
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  createHousehold,
  deleteHousehold,
  renameHousehold,
  switchHousehold,
} from "@/lib/actions/household-actions";
import { db } from "@/lib/db";
import {
  activity,
  householdMembers,
  households,
  settlements,
  users,
} from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

const U1 = { kind: "user", userId: "u1", email: "u1@x.com" } as const;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values({ id: "u1", name: "U1", email: "u1@x.com" });
  await db.insert(households).values([
    { id: "h1", name: "Mine" },
    { id: "h2", name: "Theirs" },
  ]);
  await db.insert(householdMembers).values({
    id: "m1",
    householdId: "h1",
    userId: "u1",
    name: "U1",
    role: "admin",
  });
});

beforeEach(() => {
  cookieJar.clear();
  actorState.actor = U1;
});

describe("switchHousehold", () => {
  it("switches into a household the user belongs to", async () => {
    const result = await switchHousehold("h1");
    expect(result).toEqual({ success: true });
    expect(cookieJar.get(HOUSEHOLD_COOKIE)).toBe("h1");
  });
  it("refuses a household the user does not belong to (no existence leak)", async () => {
    const result = await switchHousehold("h2");
    expect(result).toEqual({ error: "Household not found" });
    expect(cookieJar.get(HOUSEHOLD_COOKIE)).toBeUndefined();
  });
});

describe("renameHousehold", () => {
  it("renames a household the user belongs to", async () => {
    const result = await renameHousehold("h1", form({ name: "Renamed" }));
    expect(result).toEqual({ success: true });
    const [row] = await db
      .select()
      .from(households)
      .where(eq(households.id, "h1"));
    expect(row.name).toBe("Renamed");
  });
  it("refuses to rename a household the user does not belong to", async () => {
    const result = await renameHousehold("h2", form({ name: "Hijacked" }));
    expect(result).toEqual({ error: "Household not found" });
    const [row] = await db
      .select()
      .from(households)
      .where(eq(households.id, "h2"));
    expect(row.name).toBe("Theirs");
  });
});

describe("createHousehold", () => {
  it("makes the creating user an admin member of the new household", async () => {
    const result = await createHousehold(
      form({ name: "Fresh", currency: "INR" }),
    );
    expect(result).toEqual({ success: true });
    const [hh] = await db
      .select()
      .from(households)
      .where(eq(households.name, "Fresh"));
    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, hh.id));
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      userId: "u1",
      email: "u1@x.com",
      role: "admin",
    });
  });
});

describe("deleteHousehold", () => {
  it("deletes a household that has activity and settlement rows (FKs enforced)", async () => {
    // A household that has been used: an audit row and a settlement between
    // two attribution-only members, but no expenses.
    await db.insert(households).values({ id: "h-used", name: "Used" });
    await db.insert(householdMembers).values([
      {
        id: "m-used-u1",
        householdId: "h-used",
        userId: "u1",
        name: "U1",
        role: "admin",
      },
      { id: "m-used-a", householdId: "h-used", name: "Amma", role: "member" },
      { id: "m-used-b", householdId: "h-used", name: "Appa", role: "member" },
    ]);
    await db.insert(activity).values({
      id: "act-used",
      householdId: "h-used",
      actorUserId: "u1",
      actorLabel: "U1",
      action: "household.create",
      summary: "created the household",
    });
    await db.insert(settlements).values({
      id: "s-used",
      householdId: "h-used",
      fromMemberId: "m-used-a",
      toMemberId: "m-used-b",
      amountMinor: 500,
      date: "2026-01-01",
    });

    const result = await deleteHousehold("h-used");
    expect(result).toEqual({ success: true });
    expect(
      await db.select().from(households).where(eq(households.id, "h-used")),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(activity)
        .where(eq(activity.householdId, "h-used")),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(settlements)
        .where(eq(settlements.householdId, "h-used")),
    ).toHaveLength(0);
  });
});
