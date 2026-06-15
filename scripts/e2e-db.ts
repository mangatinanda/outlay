import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

/**
 * Prepares a clean, seeded SQLite database for the Playwright e2e suite.
 *
 * IMPORTANT — ordering: Playwright starts `webServer` BEFORE it runs
 * `globalSetup` (the webServer plugin's setup() resolves before any
 * globalSetup hook). So the database MUST be reset+migrated+seeded as the
 * first step of the webServer command, not in globalSetup. Doing it here, in
 * front of `next build && next start`, guarantees:
 *   1. the tables exist before the server opens a connection (no "no such
 *      table: households" cold-start race), and
 *   2. the file is created once and never deleted out from under the running
 *      server (no SQLITE_READONLY_DBMOVED on the first write).
 *
 * Deletes any stale data/e2e.db* artifacts, ensures data/ exists (libSQL does
 * NOT create the directory, and a fresh CI checkout has no data/ dir), then
 * runs drizzle migrate + seed against file:./data/e2e.db with the fixed e2e
 * credentials the webServer also uses.
 */
const E2E_ENV = {
  DATABASE_URL: "file:./data/e2e.db",
  AUTH_SECRET: "e2e-secret",
  HOUSEHOLD_PASSCODE: "e2e-pass",
};

mkdirSync("data", { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`data/e2e.db${suffix}`, { force: true });
}

execSync("pnpm db:migrate", {
  stdio: "inherit",
  env: { ...process.env, ...E2E_ENV },
});
execSync("pnpm db:seed", {
  stdio: "inherit",
  env: { ...process.env, ...E2E_ENV },
});
