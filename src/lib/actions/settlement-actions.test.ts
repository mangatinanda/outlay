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

import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  createSettlement,
  deleteSettlement,
  updateSettlement,
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

/** Insert one settlement row in h1 and return its id. */
async function seedSettlement(
  id: string,
  overrides: Partial<typeof settlements.$inferInsert> = {},
) {
  await db.insert(settlements).values({
    id,
    householdId: "h1",
    fromMemberId: "mb",
    toMemberId: "ma",
    amountMinor: 1000,
    date: "2026-06-01",
    ...overrides,
  });
  return id;
}

async function countIn(householdId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(settlements)
    .where(eq(settlements.householdId, householdId));
  return n;
}

async function rowById(id: string) {
  const [row] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.id, id));
  return row;
}

// Every test seeds its own rows (unique ids) so the file passes under
// --sequence.shuffle; the fixtures below are read-only.
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values([
    { id: "h1", name: "Home" },
    { id: "h2", name: "Other" },
  ]);
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
    { id: "o1", householdId: "h2", name: "O1", role: "admin" },
    { id: "o2", householdId: "h2", name: "O2", role: "member" },
  ]);
});

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = { kind: "superadmin" };
});

describe("createSettlement", () => {
  it("records a settlement between participants and logs activity", async () => {
    const before = await countIn("h1");
    const res = await createSettlement(
      form({
        fromMemberId: "mb",
        toMemberId: "ma",
        amount: "12.00",
        date: "2026-06-02",
      }),
    );
    expect(res).toEqual({ success: true });
    expect(await countIn("h1")).toBe(before + 1);
    const rows = await db
      .select()
      .from(settlements)
      .where(eq(settlements.amountMinor, 1200));
    expect(rows).toHaveLength(1);
    const log = await db
      .select()
      .from(activity)
      .where(eq(activity.action, "settlement.create"));
    expect(log.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects from==to and inserts no row", async () => {
    const before = await countIn("h1");
    const res = await createSettlement(
      form({
        fromMemberId: "ma",
        toMemberId: "ma",
        amount: "5",
        date: "2026-06-02",
      }),
    );
    expect(res.error).toMatch(/themselves|settle with/i);
    expect(await countIn("h1")).toBe(before);
  });

  it("rejects a non-participant member and inserts no row", async () => {
    const before = await countIn("h1");
    const res = await createSettlement(
      form({
        fromMemberId: "mx",
        toMemberId: "ma",
        amount: "5",
        date: "2026-06-02",
      }),
    );
    expect(res.error).toMatch(/settle-up/i);
    expect(await countIn("h1")).toBe(before);
  });
});

describe("deleteSettlement", () => {
  it("deletes a household-scoped settlement", async () => {
    const id = await seedSettlement("s-del");
    const res = await deleteSettlement(id);
    expect(res).toEqual({ success: true });
    expect(await rowById(id)).toBeUndefined();
  });

  it("refuses a settlement from another household", async () => {
    await db.insert(settlements).values({
      id: "s-del-foreign",
      householdId: "h2",
      fromMemberId: "o1",
      toMemberId: "o2",
      amountMinor: 100,
      date: "2026-06-01",
    });
    const res = await deleteSettlement("s-del-foreign");
    expect(res).toEqual({ error: "Settlement not found" });
    expect(await rowById("s-del-foreign")).toBeDefined();
  });
});

describe("updateSettlement", () => {
  it("rewrites the row and logs settlement.update", async () => {
    const id = await seedSettlement("s-edit");
    const res = await updateSettlement(
      id,
      form({
        fromMemberId: "ma",
        toMemberId: "mb",
        amount: "25.50",
        date: "2026-06-03",
        note: "cash",
      }),
    );
    expect(res).toEqual({ success: true });
    expect(await rowById(id)).toMatchObject({
      fromMemberId: "ma",
      toMemberId: "mb",
      amountMinor: 2550,
      date: "2026-06-03",
      note: "cash",
    });
    const log = await db
      .select()
      .from(activity)
      .where(eq(activity.action, "settlement.update"));
    expect(log.map((l) => l.summary)).toContain(
      "edited a settlement: ₹25.5 from A to B",
    );
  });

  it("refuses a settlement that belongs to another household", async () => {
    await db.insert(settlements).values({
      id: "s-foreign",
      householdId: "h2",
      fromMemberId: "o1",
      toMemberId: "o2",
      amountMinor: 100,
      date: "2026-06-01",
    });
    const res = await updateSettlement(
      "s-foreign",
      form({
        fromMemberId: "mb",
        toMemberId: "ma",
        amount: "1",
        date: "2026-06-03",
      }),
    );
    expect(res).toEqual({ error: "Settlement not found" });
    expect((await rowById("s-foreign")).amountMinor).toBe(100);
  });

  it("refuses assigning a member outside settle-up", async () => {
    const id = await seedSettlement("s-np");
    const res = await updateSettlement(
      id,
      form({
        fromMemberId: "mx",
        toMemberId: "ma",
        amount: "1",
        date: "2026-06-03",
      }),
    );
    expect(res).toEqual({
      error: "Both members must be in settle-up for this household",
    });
    expect((await rowById(id)).fromMemberId).toBe("mb");
  });

  it("still lets a row be corrected when its member has since left settle-up", async () => {
    // X was a participant when this was recorded and has been toggled out.
    const id = await seedSettlement("s-legacy", {
      fromMemberId: "mx",
      toMemberId: "ma",
    });
    const res = await updateSettlement(
      id,
      form({
        fromMemberId: "mx",
        toMemberId: "ma",
        amount: "42",
        date: "2026-06-09",
        note: "fixed",
      }),
    );
    expect(res).toEqual({ success: true });
    expect(await rowById(id)).toMatchObject({
      fromMemberId: "mx",
      amountMinor: 4200,
      note: "fixed",
    });
    // …but swapping the OTHER side to a non-participant is still refused.
    const swap = await updateSettlement(
      id,
      form({
        fromMemberId: "ma",
        toMemberId: "mx",
        amount: "42",
        date: "2026-06-09",
      }),
    );
    expect(swap).toEqual({
      error: "Both members must be in settle-up for this household",
    });
  });

  it("rejects from==to before touching the row", async () => {
    const id = await seedSettlement("s-same", { amountMinor: 777 });
    const res = await updateSettlement(
      id,
      form({
        fromMemberId: "ma",
        toMemberId: "ma",
        amount: "1",
        date: "2026-06-03",
      }),
    );
    expect(res.error).toMatch(/themselves|settle with/i);
    expect((await rowById(id)).amountMinor).toBe(777);
  });
});
