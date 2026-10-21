import { expect, test } from "@playwright/test";

/**
 * Pay via UPI from Settle up.
 *
 * The e2e fixture seeds ONE member per household (Alice in House A, who paid
 * three ₹100 expenses), so /settle-up has no suggestions out of the box. The
 * spec adds a second settle-up member through the Members sheet, gives Alice
 * a UPI ID, and then expects a "<Carol> → Alice ₹150" suggestion with a
 * "Pay via UPI" button whose dialog carries the upi://pay deep link. The
 * shared fixture is never edited (switch-household-isolation.spec.ts counts
 * expense rows, which this spec does not touch).
 *
 * The passcode value matches HOUSEHOLD_PASSCODE in playwright.config.ts's
 * webServer.env ("e2e-pass"). Never assert getByRole("alert") here — it
 * collides with the Next.js App Router route announcer.
 */
const PASSCODE = "e2e-pass";
const CAROL = `Carol ${Date.now()}`;

test("set a UPI ID, then pay a suggested settlement via UPI", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByPlaceholder("Enter household passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.waitForURL("**/dashboard");

  // A second settle-up participant so Alice's expenses produce a suggestion.
  await page.goto("/members");
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  const addSheet = page.getByRole("dialog");
  await expect(addSheet.getByText("Add Member")).toBeVisible();
  await addSheet.getByLabel("Name").fill(CAROL);
  await addSheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(addSheet).toBeHidden();
  await expect(page.getByText(CAROL)).toBeVisible();

  // Alice gets a UPI ID; the card shows it normalised to lowercase.
  await page.getByRole("button", { name: "Edit Alice" }).click();
  const editSheet = page.getByRole("dialog");
  await expect(editSheet.getByText("Edit Member")).toBeVisible();
  await editSheet.getByLabel("UPI ID (optional)").fill("Alice@OKAXIS");
  await editSheet.getByRole("button", { name: "Update", exact: true }).click();
  await expect(editSheet).toBeHidden();
  await expect(page.getByText("alice@okaxis")).toBeVisible();

  // Settle up: the new member owes Alice their equal share of her ₹300
  // (₹150 on a fresh DB; less if earlier local runs left extra members — the
  // amount is read back from the link rather than hard-coded).
  await page.goto("/settle-up");
  await expect(page.getByText("Suggested payments")).toBeVisible();
  await expect(page.getByText(CAROL).first()).toBeVisible();
  const payButton = page.getByRole("button", { name: /via UPI/ }).first();
  // Phone-first feature: the UI rules want a 44px hit area.
  expect((await payButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect((await payButton.boundingBox())?.width).toBeGreaterThanOrEqual(44);
  await payButton.click();

  const payDialog = page.getByRole("dialog");
  await expect(payDialog.getByText("Pay Alice")).toBeVisible();
  const openApp = payDialog.getByRole("link", { name: "Open UPI app" });
  const linkPattern =
    /^upi:\/\/pay\?pa=alice@okaxis&pn=Alice&am=(\d+\.\d{2})&cu=INR&tn=Outlay/;
  await expect(openApp).toHaveAttribute("href", linkPattern);
  const amount = (await openApp.getAttribute("href"))?.match(linkPattern)?.[1];
  expect(amount).toBeDefined();
  await expect(payDialog.locator("svg[role='img']")).toBeVisible();
  // The dialog zooms in on open, so poll until the boxes reach full size.
  const record = payDialog.getByRole("button", { name: "Record payment" });
  for (const target of [openApp, record]) {
    await expect
      .poll(async () => (await target.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
  }

  // "Record payment" hands off to the existing record sheet, prefilled with
  // the same amount (major units, as the form shows it).
  await payDialog.getByRole("button", { name: "Record payment" }).click();
  const recordSheet = page.getByRole("dialog");
  await expect(recordSheet.getByText("Record a payment")).toBeVisible();
  await expect(recordSheet.getByLabel("Amount")).toHaveValue(
    String(Number(amount)),
  );
});
