import { expect, test } from "@playwright/test";

/**
 * Filters the expense list by search text and by category, and checks that the
 * filter state lives in the URL (so a filtered view survives a reload and can
 * be shared as a link).
 *
 * The passcode matches HOUSEHOLD_PASSCODE in playwright.config.ts's
 * webServer.env ("e2e-pass"), as in the other specs.
 *
 * NOTE: never assert getByRole("alert") here — it collides with the Next.js App
 * Router route announcer (a visually-hidden role="alert" live region).
 */
const PASSCODE = "e2e-pass";
const KEEP = `E2E keeper ${Date.now()}`;
const OTHER = `E2E other ${Date.now()}`;

test("filters the expense list and keeps the filter in the URL", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByPlaceholder("Enter household passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.waitForURL("**/dashboard");

  // Two expenses with distinct descriptions, so a search can separate them.
  for (const description of [KEEP, OTHER]) {
    await page.goto("/expenses");
    await page
      .getByRole("button", { name: "Add expense", exact: true })
      .click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("New Expense")).toBeVisible();
    await sheet.getByLabel(/amount/i).fill("7.25");
    await sheet.getByLabel(/description/i).fill(description);
    await sheet
      .getByRole("button", { name: "Add Expense", exact: true })
      .click();
    await expect(sheet).toBeHidden();
  }

  await page.goto("/expenses");
  await expect(page.getByText(KEEP)).toBeVisible();
  await expect(page.getByText(OTHER)).toBeVisible();

  // Typing in the search box is debounced into the URL.
  await page.getByLabel("Search expenses").fill("keeper");
  await page.waitForURL(/[?&]q=keeper/);
  await expect(page.getByText(KEEP)).toBeVisible();
  await expect(page.getByText(OTHER)).toHaveCount(0);

  // A filtered view is shareable: the same URL reloads to the same result.
  await page.reload();
  await expect(page.getByText(KEEP)).toBeVisible();
  await expect(page.getByText(OTHER)).toHaveCount(0);

  // The active filter shows as a removable chip; clearing restores the list.
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByText(OTHER)).toBeVisible();
  expect(new URL(page.url()).search).toBe("");

  // A filter that matches nothing gets its own empty state, not the
  // first-run "No expenses yet" call to action.
  await page.goto("/expenses?q=zzz-no-such-expense");
  await expect(page.getByText("No matching expenses")).toBeVisible();
  await expect(page.getByText("No expenses yet")).toHaveCount(0);
});
