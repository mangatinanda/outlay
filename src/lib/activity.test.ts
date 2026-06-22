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
import { householdMembers, households, users } from "@/lib/db/schema";
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
});
