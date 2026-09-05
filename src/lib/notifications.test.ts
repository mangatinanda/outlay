import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = ":memory:";
process.env.AUTH_SECRET ??= "test-secret";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";
import { NOTIFICATIONS_KEEP, notify } from "@/lib/notifications";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values({ id: "u1", name: "A", email: "a@x.com" });
  await db.insert(users).values({ id: "u2", name: "B", email: "b@x.com" });
});

describe("notify", () => {
  it("inserts one row per (deduped) user", async () => {
    await notify({
      userIds: ["u1", "u2", "u1"],
      type: "invite.received",
      householdId: "h1",
      payload: { memberId: "m1", householdName: "Home", invitedBy: "Admin" },
    });
    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set(["u1", "u2"]));
    expect(JSON.parse(rows[0].payload).householdName).toBe("Home");
    expect(rows[0].readAt).toBeNull();
  });

  it("is a no-op for an empty recipient list", async () => {
    const before = (await db.select().from(notifications)).length;
    await notify({ userIds: [], type: "invite.accepted", payload: {} });
    expect((await db.select().from(notifications)).length).toBe(before);
  });

  it("never throws (unserializable payload is swallowed)", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(
      notify({ userIds: ["u1"], type: "expense.large", payload: circular }),
    ).resolves.toBeUndefined();
  });

  it("prunes to the newest NOTIFICATIONS_KEEP per user", async () => {
    await db.delete(notifications);
    // 5 over the cap, with distinct timestamps so ordering is deterministic.
    for (let i = 0; i < NOTIFICATIONS_KEEP + 5; i++) {
      await db.insert(notifications).values({
        id: `n${i.toString().padStart(3, "0")}`,
        userId: "u1",
        type: "expense.large",
        payload: "{}",
        createdAt: new Date(1700000000000 + i * 1000),
      });
    }
    await notify({
      userIds: ["u1"],
      type: "expense.large",
      payload: { i: "newest" },
    });
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, "u1"));
    expect(rows).toHaveLength(NOTIFICATIONS_KEEP);
    // The oldest seeded rows are gone; the freshly notified row survives.
    expect(rows.some((r) => r.id === "n000")).toBe(false);
    expect(rows.some((r) => r.payload.includes("newest"))).toBe(true);
  });

  it("never prunes invite.received rows, even when they are the oldest", async () => {
    await db.delete(notifications);
    // Oldest row of all is a pending invite; then a flood of chatty events.
    await db.insert(notifications).values({
      id: "invite-old",
      userId: "u1",
      type: "invite.received",
      payload: JSON.stringify({ memberId: "m1" }),
      createdAt: new Date(1600000000000),
    });
    for (let i = 0; i < NOTIFICATIONS_KEEP + 5; i++) {
      await db.insert(notifications).values({
        id: `n${i.toString().padStart(3, "0")}`,
        userId: "u1",
        type: "expense.large",
        payload: "{}",
        createdAt: new Date(1700000000000 + i * 1000),
      });
    }
    await notify({ userIds: ["u1"], type: "expense.large", payload: {} });
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, "u1"));
    expect(rows.some((r) => r.id === "invite-old")).toBe(true);
    expect(rows.filter((r) => r.type === "expense.large")).toHaveLength(
      NOTIFICATIONS_KEEP,
    );
  });
});
