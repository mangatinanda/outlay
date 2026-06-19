import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
});

import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});

describe("rateLimit", () => {
  it("allows up to the limit within a window, then blocks", async () => {
    const opts = { limit: 3, windowSec: 60, now: 1_000_000 };
    expect((await rateLimit("k1", opts)).limited).toBe(false); // 1
    expect((await rateLimit("k1", opts)).limited).toBe(false); // 2
    expect((await rateLimit("k1", opts)).limited).toBe(false); // 3
    const fourth = await rateLimit("k1", opts);
    expect(fourth.limited).toBe(true); // 4 > 3
    expect(fourth.count).toBe(4);
  });

  it("resets the counter in a new window", async () => {
    const base = 2_000_000;
    await rateLimit("k2", { limit: 1, windowSec: 60, now: base });
    expect(
      (await rateLimit("k2", { limit: 1, windowSec: 60, now: base })).limited,
    ).toBe(true);
    // Advance past the 60s window -> fresh count.
    const next = await rateLimit("k2", {
      limit: 1,
      windowSec: 60,
      now: base + 61_000,
    });
    expect(next.limited).toBe(false);
    expect(next.count).toBe(1);
  });

  it("keys are independent", async () => {
    const opts = { limit: 1, windowSec: 60, now: 3_000_000 };
    expect((await rateLimit("a", opts)).limited).toBe(false);
    expect((await rateLimit("b", opts)).limited).toBe(false);
  });
});
