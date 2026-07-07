import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const actorState = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return { actor: null as unknown };
});
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import {
  householdMembers,
  households,
  notifications,
  users,
} from "@/lib/db/schema";
import {
  getUnreadCount,
  listNotifications,
} from "@/lib/queries/notification-queries";

const ME = { kind: "user", userId: "u1", email: "me@x.com" } as const;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values({ id: "u1", name: "Me", email: "me@x.com" });
  await db.insert(households).values({ id: "h1", name: "Home" });
  // Pending invite row (claimable) + an already-claimed row.
  await db.insert(householdMembers).values({
    id: "m-pending",
    householdId: "h1",
    email: "me@x.com",
    name: "me",
    role: "member",
  });
  await db.insert(householdMembers).values({
    id: "m-claimed",
    householdId: "h1",
    userId: "u1",
    email: "other@x.com",
    name: "other",
    role: "member",
  });
});

beforeEach(async () => {
  actorState.actor = ME;
  await db.delete(notifications);
});

function seed(id: string, over: Partial<typeof notifications.$inferInsert>) {
  return db.insert(notifications).values({
    id,
    userId: "u1",
    type: "expense.large",
    payload: "{}",
    createdAt: new Date(1700000000000),
    ...over,
  });
}

describe("getUnreadCount", () => {
  it("counts only unread rows for the current user", async () => {
    await seed("n1", {});
    await seed("n2", { readAt: new Date() });
    expect(await getUnreadCount()).toBe(1);
  });

  it("returns 0 for superadmin and signed-out", async () => {
    await seed("n1", {});
    actorState.actor = { kind: "superadmin" };
    expect(await getUnreadCount()).toBe(0);
    actorState.actor = null;
    expect(await getUnreadCount()).toBe(0);
  });
});

describe("listNotifications", () => {
  it("returns newest-first with parsed payload and ms times", async () => {
    await seed("n1", { createdAt: new Date(1700000001000) });
    await seed("n2", {
      createdAt: new Date(1700000002000),
      payload: JSON.stringify({ description: "Rent" }),
    });
    const rows = await listNotifications();
    expect(rows.map((r) => r.id)).toEqual(["n2", "n1"]);
    expect(rows[0].payload.description).toBe("Rent");
    expect(rows[0].createdAt).toBe(1700000002000);
    expect(rows[0].readAt).toBeNull();
  });

  it("resolves live invite state: pending / accepted / gone", async () => {
    const invite = (memberId: string, id: string) =>
      seed(id, {
        type: "invite.received",
        payload: JSON.stringify({
          memberId,
          householdName: "Home",
          invitedBy: "A",
        }),
      });
    await invite("m-pending", "n1");
    await invite("m-claimed", "n2");
    await invite("m-deleted", "n3");
    const byId = new Map((await listNotifications()).map((r) => [r.id, r]));
    expect(byId.get("n1")?.inviteState).toBe("pending");
    expect(byId.get("n2")?.inviteState).toBe("accepted");
    expect(byId.get("n3")?.inviteState).toBe("gone");
  });

  it("returns [] for superadmin", async () => {
    await seed("n1", {});
    actorState.actor = { kind: "superadmin" };
    expect(await listNotifications()).toEqual([]);
  });
});
