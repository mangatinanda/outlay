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
import { createMember, updateMember } from "@/lib/actions/member-actions";
import { db } from "@/lib/db";
import { householdMembers, households } from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function memberByName(name: string) {
  const [row] = await db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.name, name));
  return row;
}

async function memberById(id: string) {
  const [row] = await db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.id, id));
  return row;
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

describe("member upiId", () => {
  it("persists a trimmed, lowercased UPI ID on create", async () => {
    await createMember(form({ name: "Priya", upiId: " Priya@OKAXIS " }));
    expect((await memberByName("Priya")).upiId).toBe("priya@okaxis");
  });

  it("stores NULL when the field is absent or empty, and clears it on update", async () => {
    await createMember(form({ name: "Ravi" }));
    const ravi = await memberByName("Ravi");
    expect(ravi.upiId).toBeNull();

    await updateMember(ravi.id, form({ name: "Ravi", upiId: "ravi@ybl" }));
    expect((await memberById(ravi.id)).upiId).toBe("ravi@ybl");

    await updateMember(ravi.id, form({ name: "Ravi", upiId: "" }));
    expect((await memberById(ravi.id)).upiId).toBeNull();
  });

  it("returns the validator error for a bad UPI ID", async () => {
    const r = await createMember(form({ name: "Bad", upiId: "nope" }));
    expect(r).toEqual({ error: "Enter a valid UPI ID, like name@bank" });
  });
});
