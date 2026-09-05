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

import { and, eq, isNull } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { revalidatePath } from "next/cache";
import {
  acceptInvite,
  declineInvite,
  markAllNotificationsRead,
} from "@/lib/actions/notification-actions";
import { db } from "@/lib/db";
import {
  activity,
  categories,
  expenses,
  householdMembers,
  households,
  notifications,
  users,
} from "@/lib/db/schema";

const INVITEE = { kind: "user", userId: "u2", email: "cara@x.com" } as const;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values({ id: "u1", name: "Admin", email: "a@x.com" });
  await db
    .insert(users)
    .values({ id: "u2", name: "Cara", email: "cara@x.com" });
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db.insert(categories).values({
    id: "c1",
    householdId: "h1",
    name: "General",
  });
  await db.insert(householdMembers).values({
    id: "m-admin",
    householdId: "h1",
    userId: "u1",
    email: "a@x.com",
    name: "Admin",
    role: "admin",
  });
});

/** An expense attributed to the pending invite row (admins can pick pending
 *  invitees as payers, so this is a real state). */
async function attributeExpenseToInvite() {
  await db.insert(expenses).values({
    id: "e-invite",
    householdId: "h1",
    categoryId: "c1",
    memberId: "m-invite",
    amountMinor: 1000,
    description: "Paid by Cara",
    date: "2026-01-01",
  });
}

beforeEach(async () => {
  actorState.actor = INVITEE;
  vi.mocked(revalidatePath).mockClear();
  await db.delete(notifications);
  await db.delete(activity);
  await db.delete(expenses);
  await db
    .delete(householdMembers)
    .where(eq(householdMembers.householdId, "h1"))
    .then(() =>
      db.insert(householdMembers).values({
        id: "m-admin",
        householdId: "h1",
        userId: "u1",
        email: "a@x.com",
        name: "Admin",
        role: "admin",
      }),
    );
  await db.insert(householdMembers).values({
    id: "m-invite",
    householdId: "h1",
    email: "cara@x.com",
    name: "cara",
    role: "member",
  });
});

describe("acceptInvite", () => {
  it("claims the invite and notifies household admins", async () => {
    const result = await acceptInvite("m-invite");
    expect(result).toEqual({ success: true });
    const [row] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, "m-invite"));
    expect(row.userId).toBe("u2");
    const admin = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, "u1"));
    expect(admin).toHaveLength(1);
    expect(admin[0].type).toBe("invite.accepted");
    expect(JSON.parse(admin[0].payload).accepterName).toBe("Cara");
  });

  it("rejects someone else's invite without leaking existence", async () => {
    actorState.actor = { kind: "user", userId: "u1", email: "a@x.com" };
    const result = await acceptInvite("m-invite");
    expect(result).toEqual({ error: "Invite no longer available" });
  });

  it("is idempotent: second accept reports no longer available", async () => {
    await acceptInvite("m-invite");
    const result = await acceptInvite("m-invite");
    expect(result).toEqual({ error: "Invite no longer available" });
  });

  it("treats already-a-member (unique conflict) as success and drops the row", async () => {
    // u2 already a linked member of h1 via a different row…
    await db.insert(householdMembers).values({
      id: "m-existing",
      householdId: "h1",
      userId: "u2",
      name: "Cara",
      role: "member",
    });
    const result = await acceptInvite("m-invite");
    expect(result).toEqual({ success: true });
    const leftovers = await db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.id, "m-invite"),
          isNull(householdMembers.userId),
        ),
      );
    expect(leftovers).toHaveLength(0);
    // The switcher + scoped lists must refresh on this path too.
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("reports already-a-member when the duplicate invite row has expenses (no FK crash)", async () => {
    await db.insert(householdMembers).values({
      id: "m-existing",
      householdId: "h1",
      userId: "u2",
      name: "Cara",
      role: "member",
    });
    await attributeExpenseToInvite();
    const result = await acceptInvite("m-invite");
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/already a member/i);
    const [row] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, "m-invite"));
    expect(row).toBeDefined(); // untouched — an admin reassigns, then removes it
  });
});

describe("declineInvite", () => {
  it("deletes the pending row and notifies admins", async () => {
    const result = await declineInvite("m-invite");
    expect(result).toEqual({ success: true });
    const rows = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, "m-invite"));
    expect(rows).toHaveLength(0);
    const admin = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, "u1"));
    expect(admin).toHaveLength(1);
    expect(admin[0].type).toBe("invite.declined");
  });

  it("rejects someone else's invite", async () => {
    actorState.actor = { kind: "user", userId: "u1", email: "a@x.com" };
    const result = await declineInvite("m-invite");
    expect(result).toEqual({ error: "Invite no longer available" });
  });

  it("refuses to decline while expenses are attributed to the invite (no FK crash)", async () => {
    await attributeExpenseToInvite();
    const result = await declineInvite("m-invite");
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/reassign/i);
    const rows = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, "m-invite"));
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBeNull();
  });

  it("records the decline in the household activity feed", async () => {
    await declineInvite("m-invite");
    const rows = await db
      .select()
      .from(activity)
      .where(eq(activity.householdId, "h1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toMatch(/declined/i);
  });
});

describe("markAllNotificationsRead", () => {
  it("clears unread for the current user only", async () => {
    await db.insert(notifications).values([
      { id: "n1", userId: "u2", type: "expense.large", payload: "{}" },
      { id: "n2", userId: "u1", type: "expense.large", payload: "{}" },
    ]);
    const result = await markAllNotificationsRead();
    expect(result).toEqual({ success: true });
    const [mine] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "n1"));
    const [theirs] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "n2"));
    expect(mine.readAt).not.toBeNull();
    expect(theirs.readAt).toBeNull();
  });
});
