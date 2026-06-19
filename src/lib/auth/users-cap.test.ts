import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  process.env.HOUSEHOLD_ALLOWED_EMAILS = "*"; // open sign-up
  process.env.MAX_USERS = "2"; // tiny global cap for the test
});

import { migrate } from "drizzle-orm/libsql/migrator";
import { canSignIn } from "@/lib/auth/users";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});

describe("canSignIn under open sign-up with a global cap", () => {
  it("admits new accounts below the cap, blocks strangers at it, and always lets existing accounts back", async () => {
    // 0 users < cap of 2 -> a brand-new email is admitted.
    expect(await canSignIn("first@example.com")).toBe(true);

    // Fill the users table to the cap.
    await db.insert(users).values([
      { id: "u1", name: "One", email: "one@example.com" },
      { id: "u2", name: "Two", email: "two@example.com" },
    ]);

    // 2 users >= cap -> a brand-new stranger is blocked.
    expect(await canSignIn("stranger@example.com")).toBe(false);

    // ...but an already-registered account always returns (case-insensitive).
    expect(await canSignIn("one@example.com")).toBe(true);
    expect(await canSignIn("ONE@example.com")).toBe(true);
  });
});
