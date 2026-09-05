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
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { updateExpenseNotifyThreshold } from "@/lib/actions/settings-actions";
import { db } from "@/lib/db";
import { householdMembers, households, users } from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

const ADMIN = { kind: "user", userId: "u1", email: "a@x.com" } as const;
const MEMBER = { kind: "user", userId: "u2", email: "b@x.com" } as const;

function form(amount: string) {
  const fd = new FormData();
  fd.set("amount", amount);
  return fd;
}

async function threshold() {
  const [h] = await db
    .select({ v: households.notifyExpenseOverMinor })
    .from(households)
    .where(eq(households.id, "h1"));
  return h.v;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values([
    { id: "u1", name: "Admin", email: "a@x.com" },
    { id: "u2", name: "Member", email: "b@x.com" },
  ]);
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db.insert(householdMembers).values([
    { id: "m1", householdId: "h1", userId: "u1", name: "Admin", role: "admin" },
    {
      id: "m2",
      householdId: "h1",
      userId: "u2",
      name: "Member",
      role: "member",
    },
  ]);
});

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = ADMIN;
});

describe("updateExpenseNotifyThreshold", () => {
  it("stores major units as minor units", async () => {
    const result = await updateExpenseNotifyThreshold(form("500"));
    expect(result).toEqual({ success: true });
    expect(await threshold()).toBe(50000);
  });

  it("empty and zero turn the threshold off (null)", async () => {
    await updateExpenseNotifyThreshold(form("500"));
    await updateExpenseNotifyThreshold(form(""));
    expect(await threshold()).toBeNull();
    await updateExpenseNotifyThreshold(form("500"));
    await updateExpenseNotifyThreshold(form("0"));
    expect(await threshold()).toBeNull();
  });

  it("rejects a non-admin member", async () => {
    actorState.actor = MEMBER;
    const result = await updateExpenseNotifyThreshold(form("500"));
    expect(result.error).toMatch(/admin/i);
  });

  it("rejects a negative amount", async () => {
    const result = await updateExpenseNotifyThreshold(form("-5"));
    expect(result.error).toBeTruthy();
  });
});
