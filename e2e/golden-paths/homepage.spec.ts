import { expect, test } from "@playwright/test";

// Marketplace homepage golden-path E2E (FR17, Story 3.1).
//
// Pre-condition: the `subjects` table is seeded with all 11 launch rows.
// `pnpm seed:dogfood` populates this; CI's e2e job runs that seed before
// playwright per `.github/workflows/ci.yml`. If the test env is empty, the
// taxonomy assertions skip cleanly via `test.skip()`.

test("homepage renders hero + headline-four + full taxonomy; subject card navigation works", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  // 1. Hero <h1> contains the locked headline copy.
  await expect(page.locator("h1").first()).toContainText("המורה הנכון");

  // 2. All four headline subject names visible at least once.
  await expect(page.getByText("מתמטיקה").first()).toBeVisible();
  await expect(page.getByText("אנגלית").first()).toBeVisible();
  await expect(page.getByText("עברית ולשון").first()).toBeVisible();
  await expect(page.getByText("פסיכומטרי").first()).toBeVisible();

  // 3. Section headings — confirms both bands rendered.
  await expect(page.getByText("המקצועות הפופולריים")).toBeVisible();
  // Pre-condition guard: if the `subjects` table is empty (no seed), the
  // taxonomy section renders the empty-state copy instead of the grid; skip
  // the rest of the test cleanly.
  const emptyState = page.getByText("המקצועות מתעדכנים, חזרו בקרוב.");
  if (await emptyState.isVisible().catch(() => false)) {
    test.skip(
      true,
      "subjects table not seeded — taxonomy empty-state visible. Run `pnpm seed:dogfood` first.",
    );
    return;
  }

  await expect(page.getByText("כל המקצועות")).toBeVisible();

  // 4. All 7 non-headline subject names visible at least once.
  await expect(page.getByText("ביולוגיה").first()).toBeVisible();
  await expect(page.getByText("חשבונאות").first()).toBeVisible();
  await expect(page.getByText("כימיה").first()).toBeVisible();
  await expect(page.getByText("כלכלה").first()).toBeVisible();
  await expect(page.getByText("מדעי המחשב").first()).toBeVisible();
  await expect(page.getByText("סטטיסטיקה").first()).toBeVisible();
  await expect(page.getByText("פיזיקה").first()).toBeVisible();

  // 5. Clicking the math card emits /browse?subject=mathematics.
  // The headline-four math card is first by display order; use .first().
  await page.getByRole("link", { name: "מתמטיקה" }).first().click();
  await expect(page).toHaveURL(/\/browse\?subject=mathematics/);
});
