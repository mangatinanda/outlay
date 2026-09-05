import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
// Override with E2E_PORT when localhost:3000 is busy (e.g. another project's
// dev server): with reuseExistingServer on, Playwright would otherwise talk
// to that foreign server instead of booting Outlay.
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

/**
 * Mobile-first e2e config. Single Pixel 7 project — Outlay is a phone-first
 * household PWA, so the smoke suite runs at the primary form factor only.
 *
 * The webServer resets + migrates + seeds a dedicated SQLite file
 * (data/e2e.db) and THEN builds + starts the real Next.js server, all in one
 * command with fixed e2e credentials so the passcode-unlock path is
 * deterministic. The DB work is the first step of the webServer command — NOT
 * a Playwright globalSetup — on purpose: Playwright starts the webServer
 * BEFORE running globalSetup, so seeding from globalSetup would (a) race the
 * server's first query on a cold DB ("no such table: households") and (b)
 * delete the file out from under the already-running server's open connection
 * (SQLITE_READONLY_DBMOVED on the first write). Doing it in front of
 * `next start` guarantees the schema+seed exist before the server opens its
 * connection, and the file is never moved while the server holds it.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "pnpm db:e2e:reset && pnpm build && pnpm start",
    url: baseURL,
    reuseExistingServer: !isCI,
    // Cold runs do a DB reset + a full `next build` before the server is
    // reachable; 300s leaves comfortable headroom over the ~slowest observed
    // cold build so startup never trips the readiness timeout.
    timeout: 300_000,
    env: {
      PORT: String(port), // honoured by `next start`
      DATABASE_URL: "file:./data/e2e.db",
      AUTH_SECRET: "e2e-secret",
      HOUSEHOLD_PASSCODE: "e2e-pass",
      // Auth.js trusts the e2e host so /api/auth/session doesn't error under
      // `next start` (no inferred trusted host outside Vercel).
      AUTH_URL: baseURL,
      AUTH_TRUST_HOST: "true",
    },
  },
});
