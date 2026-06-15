import { expect, test } from "@playwright/test";

/**
 * Passcode-only smoke test. Google sign-in needs a real IdP, so the e2e
 * suite exercises the shared-passcode path exclusively. The passcode value
 * matches HOUSEHOLD_PASSCODE in playwright.config.ts's webServer.env.
 *
 * NOTE: never assert getByRole("alert") here — it collides with the
 * Next.js App Router route announcer (a visually-hidden role="alert"
 * live region). See .claude/rules/playwright.md.
 *
 * NOTE: "Welcome to Outlay" is a CardTitle <div data-slot="card-title">,
 * NOT a heading — assert it with getByText, never getByRole("heading").
 * The dashboard "Dashboard" title IS a real <h1> (PageHeader).
 */
test("unlocks with the household passcode and shows the dashboard", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(page.getByText("Welcome to Outlay")).toBeVisible();

  await page.getByPlaceholder("Enter household passcode").fill("e2e-pass");
  await page.getByRole("button", { name: "Unlock" }).click();

  await page.waitForURL("**/dashboard");
  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
});
