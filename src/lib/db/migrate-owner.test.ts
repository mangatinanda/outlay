import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
});

import { and, eq, isNotNull } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import { migrateOwner, OWNER_EMAIL } from "@/lib/db/migrate-owner";
import { householdMembers, households, users } from "@/lib/db/schema";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values([
    { id: "h1", name: "Existing One" },
    { id: "h2", name: "Existing Two" },
  ]);
});

describe("migrateOwner", () => {
  it("creates the owner and an admin membership per household, idempotently", async () => {
    await migrateOwner();

    const owners = await db
      .select()
      .from(users)
      .where(eq(users.email, OWNER_EMAIL));
    expect(owners).toHaveLength(1);

    const memberships = await db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.userId, owners[0].id),
          isNotNull(householdMembers.userId),
        ),
      );
    expect(memberships).toHaveLength(2);
    expect(memberships.every((m) => m.role === "admin")).toBe(true);

    // Re-run must not duplicate.
    await migrateOwner();
    const after = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.userId, owners[0].id));
    expect(after).toHaveLength(2);
  });
});
