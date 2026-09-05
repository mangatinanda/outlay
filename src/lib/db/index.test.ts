import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the libSQL client so the *timing* of the connection is observable
// without opening a real database. The fake exposes the few no-op methods the
// drizzle wrapper may touch when a query builder is constructed.
const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(
    () => ({ execute: vi.fn(), batch: vi.fn(), close: vi.fn() }) as never,
  ),
}));
vi.mock("@libsql/client", () => ({ createClient }));

// Re-importing `@/lib/db` after `vi.resetModules()` re-evaluates drizzle, the
// schema and the zod env parse. That is well under a second on an idle
// machine but has exceeded the default 5s when the suite runs alongside a
// build or typecheck. The import is not the code under test, so give it room.
const IMPORT_TIMEOUT_MS = 30_000;

describe("db connection timing", () => {
  afterEach(() => {
    createClient.mockClear();
    // Restores DATABASE_URL + NEXT_PHASE even when a test body was abandoned
    // by a timeout (a `finally` inside the body would not have run yet, and
    // the next test's import would then fail the strict env parse).
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it(
    "defers the connection during `next build` so no DATABASE_URL is needed",
    async () => {
      vi.resetModules();
      // Reproduce the Vercel Preview build: build phase + no DATABASE_URL. The
      // eager client used to call createClient({ url: undefined }) here and
      // throw `LibsqlError: URL_INVALID`, failing the build.
      vi.stubEnv("NEXT_PHASE", "phase-production-build");
      vi.stubEnv("DATABASE_URL", undefined);
      expect(process.env.DATABASE_URL).toBeUndefined();
      const { db } = await import("@/lib/db");
      // Importing the module (as `next build` does to collect page data) must
      // NOT open a connection.
      expect(createClient).not.toHaveBeenCalled();
      // A real query would still connect lazily — proving it's deferred, not
      // disabled.
      void db.select;
      expect(createClient).toHaveBeenCalledTimes(1);
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "connects eagerly at import outside the build phase (runtime unchanged)",
    async () => {
      vi.resetModules();
      // setup-env.ts provides DATABASE_URL; NEXT_PHASE is not the build value.
      await import("@/lib/db");
      expect(createClient).toHaveBeenCalledTimes(1);
    },
    IMPORT_TIMEOUT_MS,
  );
});
