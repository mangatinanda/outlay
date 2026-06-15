import { expect, type Page, test } from "@playwright/test";

/**
 * Data-isolation flow: a household's expenses must not leak into another.
 *
 * The e2e seed (src/lib/db/seed.ts, fired by scripts/e2e-db.ts in the
 * webServer command when DATABASE_URL points at e2e.db) creates TWO
 * households: "House A" (3 expenses incl. the HOUSEHOLD_A_ONLY_EXPENSE
 * marker) and "House B" (1 expense). getCurrentHousehold() falls back to the
 * first household, so "House A" is active on first load. Switching to B via
 * the /households manager must change the visible expense set and drop A's
 * marker entirely.
 *
 * The passcode is hard-coded to "e2e-pass" to match HOUSEHOLD_PASSCODE in
 * playwright.config.ts's webServer.env — the same convention the other specs
 * use. (The value lives in webServer.env, not the test runner's process env,
 * so reading process.env.HOUSEHOLD_PASSCODE here would be undefined.)
 *
 * NOTE: never assert getByRole("alert") — it collides with the Next.js App
 * Router route announcer (a visually-hidden role="alert" live region).
 */
const PASSCODE = "e2e-pass";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Enter household passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.waitForURL("**/dashboard");
}

test("switching household isolates its data", async ({ page }) => {
  await login(page);

  // Capture household A's expense-row count.
  await page.goto("/expenses");
  const firstHouseholdRows = await page.getByTestId("expense-row").count();

  // The A-only marker expense must be visible while A is active.
  await expect(page.getByText("HOUSEHOLD_A_ONLY_EXPENSE")).toHaveCount(1);

  // Switch to House B via the /households manager. House A is active, so it
  // shows the "Active" badge while House B shows the lone "Switch to this
  // household" button.
  await page.goto("/households");
  const houseB = page
    .getByText("House B", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'shadow-card')][1]");
  await expect(
    houseB.getByRole("button", { name: "Switch to this household" }),
  ).toBeVisible();
  await houseB
    .getByRole("button", { name: "Switch to this household" })
    .click();

  // switchHousehold sets the cookie + revalidatePath, so the manager
  // re-renders in place: House B's card now shows the "Active" badge (and no
  // longer a Switch button). Wait for that flip — it proves the switch landed
  // before we read the other household's expenses. A bare global "Active"
  // assertion would falsely pass on House A's pre-switch badge.
  await expect(
    houseB.getByRole("button", { name: "Switch to this household" }),
  ).toHaveCount(0);
  await expect(houseB.getByText("Active")).toBeVisible();

  // House B's expense set must differ from A's and must NOT leak A's marker.
  await page.goto("/expenses");
  const secondHouseholdRows = await page.getByTestId("expense-row").count();

  expect(secondHouseholdRows).not.toBe(firstHouseholdRows);
  await expect(page.getByText("HOUSEHOLD_A_ONLY_EXPENSE")).toHaveCount(0);
});
