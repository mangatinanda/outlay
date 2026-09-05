import { expect, test } from "@playwright/test";

/**
 * Dashboard smoke: after passing the access gate (shared passcode), the
 * redesigned dashboard renders its core surfaces. The passcode value matches
 * HOUSEHOLD_PASSCODE in playwright.config.ts's webServer.env ("e2e-pass"),
 * the same way login.spec.ts does — the M0 webServer config does not inject an
 * E2E_PASSCODE, so the value is hard-coded to match.
 *
 * NOTE: never assert getByRole("alert") here — it collides with the Next.js
 * App Router route announcer (a visually-hidden role="alert" live region).
 * See .claude/rules/playwright.md.
 *
 * The hero "This Month" total exposes a stable [data-slot="hero-total"]
 * selector; Plan 04's e2e depends on this exact attribute, so this spec locks
 * it in.
 */
test("dashboard renders after login", async ({ page }) => {
  // Authenticate via the superadmin passcode at /admin (Model B route split —
  // /login is now the Google-only page; /admin is the passcode gate).
  await page.goto("/admin");
  await page.getByPlaceholder("Enter household passcode").fill("e2e-pass");
  await page.getByRole("button", { name: "Unlock" }).click();

  await page.waitForURL("**/dashboard");

  // The "Dashboard" title is a real <h1> (PageHeader).
  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();

  // Hero card + its stable selector (the Plan 04 contract). Use exact text so
  // the hero label isn't confused with chip captions like "...this month".
  await expect(page.getByText("This Month", { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="hero-total"]')).toBeVisible();

  // The other core dashboard surfaces.
  await expect(page.getByText("Daily Spending")).toBeVisible();
  await expect(page.getByText("Recent Expenses")).toBeVisible();

  // Superadmin (passcode auth) has no userId → the notification bell is hidden.
  await expect(
    page.getByRole("button", { name: /^Notifications/ }),
  ).toHaveCount(0);
});

test("superadmin can lock admin from the avatar menu", async ({ page }) => {
  await page.goto("/admin");
  await page.getByPlaceholder("Enter household passcode").fill("e2e-pass");
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.waitForURL("**/dashboard");

  // The avatar menu identifies the passcode session and offers "Lock admin".
  await page.getByRole("button", { name: "Open user menu" }).click();
  await expect(page.getByText("Signed in with passcode")).toBeVisible();
  await page.getByRole("button", { name: "Lock admin" }).click();

  // Passcode cookie gone; with no Google session the proxy bounces to /login.
  await page.waitForURL("**/login");
  await expect(page.getByText("Welcome to Outlay")).toBeVisible();
});
