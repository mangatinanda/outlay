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
import { updateHouseholdAccent } from "@/lib/actions/accent-actions";
import { db } from "@/lib/db";
import { householdMembers, households, users } from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

const U1 = { kind: "user", userId: "u1", email: "u1@x.com" } as const;

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
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = U1;
});

describe("updateHouseholdAccent", () => {
  it("sets a valid accent on the active household", async () => {
    const result = await updateHouseholdAccent("h1", "saffron");
    expect(result).toEqual({ success: true });
    const [row] = await db
      .select()
      .from(households)
      .where(eq(households.id, "h1"));
    expect(row.accent).toBe("saffron");
  });

  it("accepts null to reset to the default", async () => {
    await updateHouseholdAccent("h1", "indigo");
    const result = await updateHouseholdAccent("h1", null);
    expect(result).toEqual({ success: true });
    const [row] = await db
      .select()
      .from(households)
      .where(eq(households.id, "h1"));
    expect(row.accent).toBeNull();
  });

  it("rejects an unknown accent key", async () => {
    const result = await updateHouseholdAccent(
      "h1",
      "rainbow" as unknown as null,
    );
    expect(result.error).toBeTruthy();
  });

  it("rejects when the user is not a member of the target household", async () => {
    // u1 is only a member of h1; trying to change h2 must be refused with the
    // generic 'not found' error (no existence leak).
    const result = await updateHouseholdAccent("h2", "rose");
    expect(result).toEqual({ error: "Household not found" });
    const [row] = await db
      .select()
      .from(households)
      .where(eq(households.id, "h2"));
    expect(row.accent).toBeNull();
  });
});
