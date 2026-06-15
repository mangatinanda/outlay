import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

/**
 * Mobile-first e2e config. Single Pixel 7 project — Outlay is a phone-first
 * household PWA, so the smoke suite runs at the primary form factor only.
 * The webServer builds + starts the real Next.js server against a dedicated
 * seeded SQLite file (data/e2e.db, built by e2e/global-setup.ts) with fixed
 * e2e credentials so the passcode-unlock path is deterministic.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: {
      DATABASE_URL: "file:./data/e2e.db",
      AUTH_SECRET: "e2e-secret",
      HOUSEHOLD_PASSCODE: "e2e-pass",
    },
  },
});
