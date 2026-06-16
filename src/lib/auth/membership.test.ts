import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
});

import { migrate } from "drizzle-orm/libsql/migrator";
import {
  assertCanAccessHousehold,
  isMember,
  userHouseholds,
} from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { householdMembers, households, users } from "@/lib/db/schema";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values([
    { id: "u1", name: "U1", email: "u1@x.com" },
    { id: "u2", name: "U2", email: "u2@x.com" },
  ]);
  await db.insert(households).values([
    { id: "h1", name: "H1" },
    { id: "h2", name: "H2" },
    { id: "h3", name: "H3" },
  ]);
  await db.insert(householdMembers).values([
    {
      id: "m1",
      householdId: "h1",
      userId: "u1",
      email: "u1@x.com",
      name: "U1",
      role: "admin",
    },
    {
      id: "m2",
      householdId: "h2",
      userId: "u1",
      email: "u1@x.com",
      name: "U1",
      role: "member",
    },
    {
      id: "m3",
      householdId: "h3",
      userId: "u2",
      email: "u2@x.com",
      name: "U2",
      role: "admin",
    },
    { id: "m4", householdId: "h1", name: "Label only", role: "member" }, // no userId
  ]);
});

describe("isMember", () => {
  it("is true for a user's household and false otherwise", async () => {
    expect(await isMember("u1", "h1")).toBe(true);
    expect(await isMember("u1", "h3")).toBe(false);
  });
});

describe("userHouseholds", () => {
  it("returns only the user's households, ordered by name", async () => {
    const rows = await userHouseholds("u1");
    expect(rows.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(rows[0]).toMatchObject({ id: "h1", name: "H1", currency: "INR" });
  });
});

describe("assertCanAccessHousehold", () => {
  it("passes for a superadmin on any household", async () => {
    await expect(
      assertCanAccessHousehold({ kind: "superadmin" }, "h3"),
    ).resolves.toBeUndefined();
  });
  it("passes for a member and throws for a non-member", async () => {
    await expect(
      assertCanAccessHousehold(
        { kind: "user", userId: "u1", email: "u1@x.com" },
        "h1",
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertCanAccessHousehold(
        { kind: "user", userId: "u1", email: "u1@x.com" },
        "h3",
      ),
    ).rejects.toThrow();
  });
});
