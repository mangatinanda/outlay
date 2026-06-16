import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  // Non-empty allow-list so a non-listed email falls through to the membership
  // branch instead of being allowed by the dev-mode empty-list shortcut.
  process.env.HOUSEHOLD_ALLOWED_EMAILS = "owner@example.com";
});

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { canSignIn, claimInvites, upsertUserByEmail } from "@/lib/auth/users";
import { db } from "@/lib/db";
import { householdMembers, households, users } from "@/lib/db/schema";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "hh-1", name: "Home" });
});

describe("upsertUserByEmail", () => {
  it("creates a user and returns a stable id, reusing it on the next call", async () => {
    const id1 = await upsertUserByEmail({
      email: "A@Example.com",
      name: "Ann",
    });
    const id2 = await upsertUserByEmail({
      email: "a@example.com",
      name: "Ann B",
    });
    expect(id2).toBe(id1);
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, "a@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Ann B"); // refreshed on upsert
  });

  it("does not throw updating an existing user when no name/image is passed", async () => {
    const id1 = await upsertUserByEmail({
      email: "noargs@example.com",
      name: "First",
    });
    const id2 = await upsertUserByEmail({ email: "noargs@example.com" });
    expect(id2).toBe(id1);
    const [row] = await db.select().from(users).where(eq(users.id, id1));
    expect(row.name).toBe("First"); // unchanged, and no "No values to set" throw
  });
});

describe("claimInvites", () => {
  it("links pending-invite rows matching the email to the user id", async () => {
    await db.insert(householdMembers).values({
      id: "m-1",
      householdId: "hh-1",
      email: "invitee@example.com",
      name: "invitee",
      role: "member",
    });
    const userId = await upsertUserByEmail({ email: "invitee@example.com" });
    await claimInvites("invitee@example.com", userId);
    const [row] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, "m-1"));
    expect(row.userId).toBe(userId);
  });
});

describe("canSignIn", () => {
  it("allows an allow-listed email", async () => {
    expect(await canSignIn("owner@example.com")).toBe(true);
  });
  it("allows a non-listed email that has a membership/invite row", async () => {
    expect(await canSignIn("invitee@example.com")).toBe(true);
  });
  it("rejects a non-listed email with no membership", async () => {
    expect(await canSignIn("stranger@example.com")).toBe(false);
  });
  it("rejects a null email", async () => {
    expect(await canSignIn(null)).toBe(false);
  });
});
