import { expect, test } from "@playwright/test";

// Marketplace homepage golden-path E2E. Rebuilt for the landing-v2
// structure (2026-05-21): hero + subject grid + how-it-works + featured
// tutors + trust strip + FAQ + tutor-recruiting band.
//
// The `subjects` table may not be seeded in the test env. The hero and the
// static sections are asserted unconditionally; the subject-grid
// assertions + card navigation run only when the grid is populated.
//
// IMPORTANT: the empty-state check runs BEFORE any subject-name assertion.
// The rebuilt homepage has no hardcoded headline-four fallback (the old
// `HeadlineFourSubjects` did) — an unseeded grid shows only its
// empty-state copy, so a subject assertion ahead of the skip would
// hard-fail instead of skipping cleanly.

test("homepage renders the landing-v2 sections; subject card navigation works", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  // 1. Hero — locked headline copy + the subject search CTA.
  await expect(page.locator("h1").first()).toContainText("המורה הנכון");
  await expect(
    page.getByRole("button", { name: "מצאו מורה" }),
  ).toBeVisible();

  // 2. Static sections — these render regardless of DB state.
  await expect(
    page.getByRole("heading", { name: "המקצועות הפופולריים" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "איך זה עובד" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "שאלות נפוצות" })).toBeVisible();

  // 3. Subject grid: an unseeded `subjects` table renders the empty-state
  // copy instead of the cards — skip the grid-dependent assertions.
  const emptyState = page.getByText("המקצועות מתעדכנים, חזרו בקרוב.");
  if (await emptyState.isVisible().catch(() => false)) {
    test.skip(
      true,
      "subjects table not seeded — subject-grid empty-state visible. Run `pnpm db:seed` first.",
    );
    return;
  }

  // 4. The four headline subjects lead the grid. Target the card <h3>
  //    headings exactly — a plain text match would also hit the hidden
  //    <option>s the hero search's Radix Select renders for each subject.
  await expect(
    page.getByRole("heading", { name: "מתמטיקה", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "אנגלית", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "עברית ולשון", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "פסיכומטרי", exact: true }),
  ).toBeVisible();

  // 5. Clicking the math subject card navigates to /browse?subject=mathematics.
  //    Located by exact href — unambiguous vs. featured-tutor card links.
  await page.locator('a[href="/browse?subject=mathematics"]').click();
  await expect(page).toHaveURL(/\/browse\?subject=mathematics/);
});
