import { beforeAll, describe, expect, it, vi } from "vitest";

const actorState = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return { actor: { kind: "superadmin" } as unknown };
});

vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { migrate } from "drizzle-orm/libsql/migrator";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { activity, householdMembers, households, users } from "@/lib/db/schema";
import { getActivity } from "@/lib/queries/activity-queries";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db.insert(users).values({ id: "u1", name: "Nanda", email: "n@x.com" });
  await db.insert(householdMembers).values({
    id: "m1",
    householdId: "h1",
    userId: "u1",
    name: "Nanda",
    role: "admin",
  });
});

describe("logActivity + getActivity", () => {
  it("logs a superadmin action as 'Admin' and reads it back", async () => {
    actorState.actor = { kind: "superadmin" };
    await logActivity({
      householdId: "h1",
      action: "expense.create",
      summary: 'added "Groceries ₹1,000"',
    });
    const rows = await getActivity("h1");
    expect(rows[0]).toMatchObject({
      actorLabel: "Admin",
      summary: 'added "Groceries ₹1,000"',
    });
  });

  it("labels a user action with their household member name", async () => {
    actorState.actor = { kind: "user", userId: "u1", email: "n@x.com" };
    await logActivity({
      householdId: "h1",
      action: "settlement.create",
      summary: "settled ₹500 to Siva",
    });
    const rows = await getActivity("h1");
    expect(rows[0].actorLabel).toBe("Nanda"); // newest first
  });

  it("never throws (best-effort) on a bad household id", async () => {
    await expect(
      logActivity({
        householdId: "nope",
        action: "expense.create",
        summary: "x",
      }),
    ).resolves.toBeUndefined();
  });

  it("falls back to users.name when the user is not a household member", async () => {
    await db
      .insert(users)
      .values({ id: "u2", name: "Standalone", email: "s@x.com" });
    actorState.actor = { kind: "user", userId: "u2", email: "s@x.com" };
    await logActivity({
      householdId: "h1",
      action: "expense.create",
      summary: "x",
    });
    const rows = await getActivity("h1");
    expect(rows[0].actorLabel).toBe("Standalone"); // newest first
  });

  it("applies the `before` cursor (returns only older rows)", async () => {
    await db.insert(households).values({ id: "h2", name: "Cursor" });
    await db.insert(activity).values([
      {
        id: "a-old",
        householdId: "h2",
        actorLabel: "Admin",
        action: "expense.create",
        summary: "old",
        createdAt: new Date(1000),
      },
      {
        id: "a-new",
        householdId: "h2",
        actorLabel: "Admin",
        action: "expense.create",
        summary: "new",
        createdAt: new Date(5000),
      },
    ]);
    const rows = await getActivity("h2", { before: 3000 });
    expect(rows.map((r) => r.id)).toEqual(["a-old"]);
  });
});
