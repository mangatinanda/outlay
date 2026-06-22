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
import {
  createSettlement,
  deleteSettlement,
} from "@/lib/actions/settlement-actions";
import { db } from "@/lib/db";
import {
  activity,
  householdMembers,
  households,
  settlements,
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
});

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = { kind: "superadmin" };
});

describe("createSettlement", () => {
  it("records a settlement between participants and logs activity", async () => {
    const res = await createSettlement(
      form({
        fromMemberId: "mb",
        toMemberId: "ma",
        amount: "12.00",
        date: "2026-06-02",
      }),
    );
    expect(res).toEqual({ success: true });
    const rows = await db
      .select()
      .from(settlements)
      .where(eq(settlements.householdId, "h1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].amountMinor).toBe(1200);
    const log = await db
      .select()
      .from(activity)
      .where(eq(activity.action, "settlement.create"));
    expect(log).toHaveLength(1);
  });

  it("rejects from==to and inserts no row", async () => {
    const res = await createSettlement(
      form({
        fromMemberId: "ma",
        toMemberId: "ma",
        amount: "5",
        date: "2026-06-02",
      }),
    );
    expect(res.error).toMatch(/themselves|settle with/i);
    // No row inserted (only the happy-path settlement exists).
    expect(
      await db
        .select()
        .from(settlements)
        .where(eq(settlements.householdId, "h1")),
    ).toHaveLength(1);
  });

  it("rejects a non-participant member and inserts no row", async () => {
    const res = await createSettlement(
      form({
        fromMemberId: "mx",
        toMemberId: "ma",
        amount: "5",
        date: "2026-06-02",
      }),
    );
    expect(res.error).toMatch(/settle-up/i);
    expect(
      await db
        .select()
        .from(settlements)
        .where(eq(settlements.householdId, "h1")),
    ).toHaveLength(1);
  });
});

describe("deleteSettlement", () => {
  it("deletes a household-scoped settlement", async () => {
    const [row] = await db
      .select()
      .from(settlements)
      .where(eq(settlements.householdId, "h1"));
    const res = await deleteSettlement(row.id);
    expect(res).toEqual({ success: true });
    expect(
      await db.select().from(settlements).where(eq(settlements.id, row.id)),
    ).toHaveLength(0);
  });
});
