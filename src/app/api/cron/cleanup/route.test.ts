import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  process.env.CRON_SECRET = "cron-test-secret";
});

import { migrate } from "drizzle-orm/libsql/migrator";
import { GET } from "@/app/api/cron/cleanup/route";
import { db } from "@/lib/db";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});

function req(headers: Record<string, string> = {}) {
  return new Request("https://example.com/api/cron/cleanup", { headers });
}

describe("GET /api/cron/cleanup", () => {
  it("rejects requests without the correct bearer token", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req({ authorization: "Bearer wrong" }))).status).toBe(
      401,
    );
  });

  it("runs cleanup with the correct bearer token", async () => {
    const res = await GET(req({ authorization: "Bearer cron-test-secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      deletedUsers: 0,
      deletedHouseholds: 0,
    });
  });
});
