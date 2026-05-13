import { expect, test } from "@playwright/test";

test("password reset: forgot → email outbox → reset → re-signin (Story 1.15)", async ({ page }, testInfo) => {
  // Smoke-check: the new /signin/forgot page renders. This runs even without a
  // DATABASE_URL — catches build/render regressions in a CI without DB access.
  await page.goto("/signin/forgot");
  await expect(
    page.getByRole("heading", { name: "איפוס סיסמה" }),
  ).toBeVisible();

  // Graceful skip if no DB — same pattern as Story 1.14 signin-fixture.
  const { provisionVerifiedUser, peekResetUrl } = await import("./password-reset.flow");
  const oldPassword = "oldpass12345";
  const newPassword = "newpass67890";
  const verified = await provisionVerifiedUser(testInfo, oldPassword);
  if (!verified) {
    test.skip(
      true,
      "DATABASE_URL not set — password-reset fixture cannot run; rendered-page check above still ran. (Set DATABASE_URL to run end-to-end.)",
    );
    return;
  }

  // Submit the forgot form.
  await page.getByLabel("אימייל").fill(verified.email);
  await page.getByRole("button", { name: /שלחו לי קישור/ }).click();

  // Should land on the anti-enumeration success screen.
  await expect(page).toHaveURL(/\/signin\/forgot\/sent\?email=/);
  await expect(
    page.getByRole("heading", { name: "בדקו את תיבת הדואר" }),
  ).toBeVisible();

  // Read the reset URL from the dev outbox.
  const resetUrl = await peekResetUrl(verified.email);
  expect(resetUrl, "reset URL written to _dev_email_outbox").toBeTruthy();

  // Convert absolute URL → relative (origin may differ between dev / preview / CI).
  const url = new URL(resetUrl!);
  await page.goto(url.pathname + url.search);

  // Reset form should be visible.
  await expect(
    page.getByRole("heading", { name: "בחירת סיסמה חדשה" }),
  ).toBeVisible();

  // Submit the new password.
  await page.getByLabel("סיסמה חדשה").fill(newPassword);
  await page.getByLabel("אישור סיסמה").fill(newPassword);
  await page.getByRole("button", { name: /עדכנו סיסמה/ }).click();

  // Should redirect to /signin?reset=1 with the success banner.
  await expect(page).toHaveURL(/\/signin\?reset=1/);
  await expect(page.getByText("הסיסמה אופסה בהצלחה")).toBeVisible();

  // Sign in with the NEW password — proves the hash was actually updated.
  await page.getByLabel("אימייל").fill(verified.email);
  await page.getByLabel("סיסמה").fill(newPassword);
  await page.getByRole("button", { name: /התחברו/ }).click();

  // Lands on dashboard (default post-signin path).
  await expect(page).toHaveURL(/\/dashboard/);
});
