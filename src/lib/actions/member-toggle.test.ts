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
  createMember,
  deleteMember,
  updateMember,
} from "@/lib/actions/member-actions";
import { db } from "@/lib/db";
import {
  categories,
  expenseSplits,
  expenses,
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
});
beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = { kind: "superadmin" };
});

describe("member include_in_settle_up", () => {
  it("defaults to true and persists an off toggle on create", async () => {
    await createMember(form({ name: "On", role: "member" })); // no toggle field => default true
    await createMember(
      form({ name: "Off", role: "member", includeInSettleUp: "false" }),
    );
    const rows = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, "h1"));
    expect(rows.find((m) => m.name === "On")?.includeInSettleUp).toBe(true);
    expect(rows.find((m) => m.name === "Off")?.includeInSettleUp).toBe(false);
  });

  it("blocks deleting a member referenced by a settlement", async () => {
    await createMember(form({ name: "Payer", role: "member" }));
    await createMember(form({ name: "Payee", role: "member" }));
    const all = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, "h1"));
    const payer = all.find((m) => m.name === "Payer")!;
    const payee = all.find((m) => m.name === "Payee")!;
    await db.insert(settlements).values({
      id: "s1",
      householdId: "h1",
      fromMemberId: payer.id,
      toMemberId: payee.id,
      amountMinor: 100,
      date: "2026-06-01",
    });
    const res = await deleteMember(payer.id);
    expect(res.error).toMatch(/settlement/i);
  });

  it("blocks deleting a member who only appears in a custom split", async () => {
    await db.insert(householdMembers).values([
      { id: "m-payer", householdId: "h1", name: "Payer", role: "admin" },
      { id: "m-sharer", householdId: "h1", name: "Sharer", role: "member" },
    ]);
    await db
      .insert(categories)
      .values({ id: "c-split", householdId: "h1", name: "Cat" });
    await db.insert(expenses).values({
      id: "e-split",
      householdId: "h1",
      categoryId: "c-split",
      memberId: "m-payer",
      amountMinor: 1000,
      description: "Split",
      date: "2026-01-02",
    });
    await db.insert(expenseSplits).values({
      id: "sp-split",
      expenseId: "e-split",
      memberId: "m-sharer",
      shareMinor: 1000,
    });
    const res = await deleteMember("m-sharer");
    expect(res).toEqual({
      error:
        "Cannot delete a member who is part of a custom split. Edit those expenses first.",
    });
    expect(
      await db
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.id, "m-sharer")),
    ).toHaveLength(1);
  });

  it("updateMember persists a toggled-off includeInSettleUp", async () => {
    await createMember(form({ name: "Editable", role: "member" }));
    const [m] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.name, "Editable"));
    expect(m.includeInSettleUp).toBe(true); // default in
    const res = await updateMember(
      m.id,
      form({ name: "Editable", role: "member", includeInSettleUp: "false" }),
    );
    expect(res).toEqual({ success: true });
    const [after] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, m.id));
    expect(after.includeInSettleUp).toBe(false);
  });
});

describe("member show_in_paid_by", () => {
  it("defaults to true and persists an off toggle on create", async () => {
    await createMember(form({ name: "Payer", role: "member" })); // absent => default true
    await createMember(
      form({ name: "NotPayer", role: "member", showInPaidBy: "false" }),
    );
    const rows = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, "h1"));
    expect(rows.find((m) => m.name === "Payer")?.showInPaidBy).toBe(true);
    expect(rows.find((m) => m.name === "NotPayer")?.showInPaidBy).toBe(false);
  });

  it("updateMember flips showInPaidBy off and back on", async () => {
    await createMember(form({ name: "Flip", role: "member" }));
    const [m] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.name, "Flip"));
    expect(m.showInPaidBy).toBe(true);

    await updateMember(
      m.id,
      form({ name: "Flip", role: "member", showInPaidBy: "false" }),
    );
    let [after] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, m.id));
    expect(after.showInPaidBy).toBe(false);
    // The other toggle is untouched by this one.
    expect(after.includeInSettleUp).toBe(true);

    await updateMember(
      m.id,
      form({ name: "Flip", role: "member", showInPaidBy: "true" }),
    );
    [after] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, m.id));
    expect(after.showInPaidBy).toBe(true);
  });
});
