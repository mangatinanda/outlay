import { expect, test } from "@playwright/test";

/**
 * Adds an expense through the mobile FAB -> bottom-sheet flow (the Pixel 7
 * project renders the mobile path), then asserts it appears in the list and
 * that the dashboard "This Month" total changes.
 *
 * The passcode value matches HOUSEHOLD_PASSCODE in playwright.config.ts's
 * webServer.env ("e2e-pass"), the same way login.spec.ts / dashboard.spec.ts do.
 * The dashboard total is read from the stable [data-slot="hero-total"] selector
 * locked in by dashboard.spec.ts (M3 contract).
 *
 * NOTE: never assert getByRole("alert") here — it collides with the Next.js App
 * Router route announcer (a visually-hidden role="alert" live region).
 */
const UNIQUE = `E2E coffee ${Date.now()}`;
const PASSCODE = "e2e-pass";

test("add an expense; it appears in the list and updates the dashboard", async ({
  page,
}) => {
  // Pass the access gate via the superadmin passcode at /admin (Model B route
  // split — /login is now the Google-only page; /admin is the passcode gate).
  await page.goto("/admin");
  await page.getByPlaceholder("Enter household passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.waitForURL("**/dashboard");

  const totalBefore = await page
    .locator('[data-slot="hero-total"]')
    .first()
    .innerText();

  await page.goto("/expenses");

  // Open the mobile bottom sheet via the FAB. Its accessible name is
  // "Add expense" (lowercase e), distinct from the "Add Expense" CTA/submit
  // buttons (the shadcn Button-as-Link still reports role=button).
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("New Expense")).toBeVisible();

  await sheet.getByLabel(/amount/i).fill("4.50");
  await sheet.getByLabel(/description/i).fill(UNIQUE);
  // First category + member chips are preselected by default; submit as-is.
  await sheet.getByRole("button", { name: "Add Expense", exact: true }).click();

  // The submit closes the sheet on success; wait for that before asserting the
  // list (avoids racing the close animation / RSC refresh).
  await expect(sheet).toBeHidden();

  // Reload the list so the assertion does not depend on router.refresh() timing;
  // the new row is server-rendered from the persisted expense.
  await page.goto("/expenses");
  await expect(page.getByText(UNIQUE)).toBeVisible();

  await page.goto("/dashboard");
  const totalAfter = await page
    .locator('[data-slot="hero-total"]')
    .first()
    .innerText();
  expect(totalAfter).not.toBe(totalBefore);
});
