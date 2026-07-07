import { beforeAll, describe, expect, it, vi } from "vitest";

const actorState = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return { actor: null as unknown };
});
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { migrate } from "drizzle-orm/libsql/migrator";
import { GET } from "@/app/api/notifications/count/route";
import { db } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values({ id: "u1", name: "Me", email: "me@x.com" });
  await db.insert(notifications).values({
    id: "n1",
    userId: "u1",
    type: "expense.large",
    payload: "{}",
  });
});

describe("GET /api/notifications/count", () => {
  it("returns the unread count for a user", async () => {
    actorState.actor = { kind: "user", userId: "u1", email: "me@x.com" };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1 });
  });

  it("returns 0 when signed out", async () => {
    actorState.actor = null;
    const res = await GET();
    expect(await res.json()).toEqual({ count: 0 });
  });
});
