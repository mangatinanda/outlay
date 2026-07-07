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

import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { inviteToHousehold } from "@/lib/actions/invite-actions";
import { db } from "@/lib/db";
import {
  householdMembers,
  households,
  notifications,
  users,
} from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

const ADMIN = { kind: "user", userId: "u1", email: "admin@x.com" } as const;

function form(email: string) {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db
    .insert(users)
    .values({ id: "u1", name: "Admin", email: "admin@x.com" });
  await db
    .insert(users)
    .values({ id: "u2", name: "Member", email: "member@x.com" });
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db.insert(householdMembers).values({
    id: "m1",
    householdId: "h1",
    userId: "u1",
    email: "admin@x.com",
    name: "Admin",
    role: "admin",
  });
  // Non-admin member in h1 so getCurrentHousehold resolves h1 for u2
  // and the role check (not a "No household found" error) is what rejects.
  await db.insert(householdMembers).values({
    id: "m2",
    householdId: "h1",
    userId: "u2",
    email: "member@x.com",
    name: "Member",
    role: "member",
  });
});

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = ADMIN;
});

describe("inviteToHousehold", () => {
  it("creates a pending invite row for a valid email", async () => {
    const result = await inviteToHousehold(form("Invitee@Example.com"));
    expect(result).toEqual({ success: true });
    const [row] = await db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, "h1"),
          eq(householdMembers.email, "invitee@example.com"),
        ),
      );
    expect(row.userId).toBeNull();
    expect(row.role).toBe("member");
  });

  it("rejects an invalid email", async () => {
    const result = await inviteToHousehold(form("not-an-email"));
    expect(result.error).toBeTruthy();
  });

  it("rejects a duplicate invite", async () => {
    await inviteToHousehold(form("dupe@example.com"));
    const result = await inviteToHousehold(form("dupe@example.com"));
    expect(result.error).toMatch(/already/i);
  });

  it("rejects a non-admin member", async () => {
    actorState.actor = { kind: "user", userId: "u2", email: "member@x.com" };
    const result = await inviteToHousehold(form("x@example.com"));
    expect(result.error).toMatch(/admin/i);
  });
});

describe("inviteToHousehold → invite.received notification", () => {
  it("notifies an invited email that has an account", async () => {
    await db
      .insert(users)
      .values({ id: "u3", name: "Cara", email: "cara@x.com" });
    const result = await inviteToHousehold(form("cara@x.com"));
    expect(result).toEqual({ success: true });
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, "u3"));
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("invite.received");
    expect(rows[0].householdId).toBe("h1");
    const payload = JSON.parse(rows[0].payload);
    expect(payload.householdName).toBe("Home");
    expect(payload.invitedBy).toBe("Admin");
    // memberId points at the pending invite row
    const [invite] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, payload.memberId));
    expect(invite.email).toBe("cara@x.com");
    expect(invite.userId).toBeNull();
  });

  it("creates no notification for an unknown email", async () => {
    const before = (await db.select().from(notifications)).length;
    await inviteToHousehold(form("nobody@x.com"));
    expect((await db.select().from(notifications)).length).toBe(before);
  });
});
