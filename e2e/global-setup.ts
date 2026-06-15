import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

/**
 * Builds a clean, seeded e2e database before the Playwright suite runs.
 * Deletes any stale data/e2e.db* artifacts, ensures the data/ directory
 * exists (libSQL does NOT create it, and a fresh CI checkout has no data/
 * dir), then runs `pnpm db:e2e` (drizzle migrate + seed) against
 * file:./data/e2e.db. The webServer launched by playwright.config.ts is
 * pointed at the same file, so the passcode-unlock smoke test sees a fully
 * seeded household.
 */
export default function globalSetup() {
  mkdirSync("data", { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`data/e2e.db${suffix}`, { force: true });
  }
  execSync("pnpm db:e2e", { stdio: "inherit" });
}
