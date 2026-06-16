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
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import { householdMembers, households, users } from "@/lib/db/schema";
import {
  getCurrentHousehold,
  HOUSEHOLD_COOKIE,
  listHouseholds,
} from "@/lib/queries/household-queries";

const U1 = { kind: "user", userId: "u1", email: "u1@x.com" } as const;
const U2 = { kind: "user", userId: "u2", email: "u2@x.com" } as const;
const SUPER = { kind: "superadmin" } as const;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values([
    { id: "u1", name: "U1", email: "u1@x.com" },
    { id: "u2", name: "U2", email: "u2@x.com" },
  ]);
  await db.insert(households).values([
    { id: "h1", name: "Alpha" },
    { id: "h2", name: "Bravo" },
    { id: "h3", name: "Charlie" },
  ]);
  await db.insert(householdMembers).values([
    { id: "m1", householdId: "h1", userId: "u1", name: "U1", role: "admin" },
    { id: "m2", householdId: "h2", userId: "u1", name: "U1", role: "member" },
    { id: "m3", householdId: "h3", userId: "u2", name: "U2", role: "admin" },
  ]);
});

beforeEach(() => cookieJar.clear());

describe("listHouseholds", () => {
  it("returns all households for a superadmin", async () => {
    actorState.actor = SUPER;
    expect((await listHouseholds()).map((h) => h.id)).toEqual([
      "h1",
      "h2",
      "h3",
    ]);
  });
  it("returns only the user's households", async () => {
    actorState.actor = U1;
    expect((await listHouseholds()).map((h) => h.id)).toEqual(["h1", "h2"]);
  });
  it("returns [] when there is no actor", async () => {
    actorState.actor = null;
    expect(await listHouseholds()).toEqual([]);
  });
});

describe("getCurrentHousehold", () => {
  it("honors the cookie household for a member", async () => {
    actorState.actor = U1;
    cookieJar.set(HOUSEHOLD_COOKIE, "h2");
    expect((await getCurrentHousehold())?.id).toBe("h2");
  });
  it("falls back to the user's first household when the cookie points elsewhere", async () => {
    actorState.actor = U1;
    cookieJar.set(HOUSEHOLD_COOKIE, "h3"); // not a member of h3
    expect((await getCurrentHousehold())?.id).toBe("h1");
  });
  it("falls back to the user's first household with no cookie", async () => {
    actorState.actor = U2;
    expect((await getCurrentHousehold())?.id).toBe("h3");
  });
  it("lets a superadmin resolve any household by cookie", async () => {
    actorState.actor = SUPER;
    cookieJar.set(HOUSEHOLD_COOKIE, "h3");
    expect((await getCurrentHousehold())?.id).toBe("h3");
  });
  it("returns null for a user with no households", async () => {
    actorState.actor = { kind: "user", userId: "nobody", email: "no@x.com" };
    expect(await getCurrentHousehold()).toBeNull();
  });
});
