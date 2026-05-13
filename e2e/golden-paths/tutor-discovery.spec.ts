import { expect, test } from "@playwright/test";

test("intro-video gate: 404 → approve → 200 → re-upload → 404 (Story 2.3 FR12)", async ({
  page,
}, testInfo) => {
  // Graceful skip when DATABASE_URL is unset — same pattern as
  // password-reset.spec.ts.
  const {
    provisionInactiveTutor,
    simulateAdminApproval,
    simulateReuploadTrigger,
  } = await import("./tutor-discovery.flow");

  const tutor = await provisionInactiveTutor(testInfo);
  if (!tutor) {
    test.skip(
      true,
      "DATABASE_URL not set — tutor-discovery fixture cannot run.",
    );
    return;
  }

  const profileUrl = `/tutor/${tutor.userId}`;

  // 1. Fresh submit state — tutor has is_active=false. Public profile must 404.
  const beforeApproval = await page.goto(profileUrl);
  expect(
    beforeApproval?.status(),
    "tutor in vetting_status='pending' / is_active=false should 404",
  ).toBe(404);

  // 2. Simulate Story 2.4's admin approval (which doesn't exist yet).
  //    Direct Drizzle writes match the AC3 order: docs → profile vetting →
  //    is_active flip last.
  await simulateAdminApproval(tutor.userId);

  // 3. Public profile renders the stub placeholder.
  const afterApproval = await page.goto(profileUrl);
  expect(
    afterApproval?.status(),
    "tutor with is_active=true should render (200)",
  ).toBe(200);
  await expect(page).toHaveTitle(/ד״ר מיכל לוי/);
  // Story 3.2 will replace the placeholder. For now we assert the stub copy.
  await expect(
    page.getByText("פרופיל המורה — בקרוב"),
  ).toBeVisible();

  // 4. Simulate Story 2.5's re-upload trigger (which doesn't exist yet).
  //    AC4: is_active=false flips FIRST so partial-failure leaves the tutor
  //    invisible-but-stale rather than visible-with-unvetted-content.
  await simulateReuploadTrigger(tutor.userId);

  // 5. Public profile 404s again.
  const afterReupload = await page.goto(profileUrl);
  expect(
    afterReupload?.status(),
    "tutor flipped back to is_active=false should 404 again",
  ).toBe(404);
});

test("malformed UUID slug → 404 (Story 2.3, AC1 defensive parsing)", async ({
  page,
}) => {
  // Smoke-test that doesn't require a DB. The route's UUID pre-validation
  // should short-circuit to notFound() without ever issuing a DB query —
  // protects against Postgres' uuid cast surfacing as a 500.
  const response = await page.goto("/tutor/not-a-uuid");
  expect(response?.status()).toBe(404);
});
