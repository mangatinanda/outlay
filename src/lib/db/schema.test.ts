import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
});

import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import { householdMembers, households } from "@/lib/db/schema";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "hh-1", name: "Home" });
});

describe("household_members.email", () => {
  it("round-trips an email and a null userId on a pending invite", async () => {
    await db.insert(householdMembers).values({
      id: "m-1",
      householdId: "hh-1",
      email: "invitee@example.com",
      name: "invitee",
      role: "member",
    });
    const [row] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, "m-1"));
    expect(row.email).toBe("invitee@example.com");
    expect(row.userId).toBeNull();
  });

  it("rejects a duplicate (householdId, email) invite", async () => {
    await db.insert(householdMembers).values({
      id: "m-2",
      householdId: "hh-1",
      email: "dup@example.com",
      name: "dup",
      role: "member",
    });
    await expect(
      db.insert(householdMembers).values({
        id: "m-3",
        householdId: "hh-1",
        email: "dup@example.com",
        name: "dup2",
        role: "member",
      }),
    ).rejects.toThrow();
  });

  it("allows many attribution-only members (null email) in one household", async () => {
    await db.insert(householdMembers).values([
      { id: "m-4", householdId: "hh-1", name: "Kid A", role: "member" },
      { id: "m-5", householdId: "hh-1", name: "Kid B", role: "member" },
    ]);
    const rows = await db
      .select()
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, "hh-1")));
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });
});
