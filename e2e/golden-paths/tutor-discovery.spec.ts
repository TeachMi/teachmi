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
  // Story 3.2 replaced the stub with the real profile UX. The verified
  // badge is the most distinctive Story 3.2 marker — appears unconditionally
  // for any discoverable tutor.
  await expect(page.getByText("מורה מאומתת").first()).toBeVisible();

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

test("approved tutor profile renders hero + subjects + bio + availability empty-state (Story 3.2)", async ({
  page,
}, testInfo) => {
  const {
    provisionInactiveTutor,
    simulateAdminApproval,
    seedTutorSubjects,
    clearTutorSeededData,
  } = await import("./tutor-discovery.flow");

  const tutor = await provisionInactiveTutor(testInfo);
  if (!tutor) {
    test.skip(true, "DATABASE_URL not set — tutor-discovery fixture cannot run.");
    return;
  }

  await clearTutorSeededData(tutor.userId);
  await seedTutorSubjects(tutor.userId, ["mathematics", "english"]);
  await simulateAdminApproval(tutor.userId);

  const response = await page.goto(`/tutor/${tutor.userId}`);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/ד״ר מיכל לוי/);

  // Hero displayName
  await expect(
    page.getByRole("heading", { name: /ד״ר מיכל לוי/, level: 1 }),
  ).toBeVisible();

  // Subject chips — both seeded subjects' Hebrew names visible
  await expect(page.getByText(/מתמטיקה/).first()).toBeVisible();
  await expect(page.getByText(/אנגלית/).first()).toBeVisible();

  // Bio paragraph
  await expect(
    page.getByText(/מורה למתמטיקה — שיעורים פרטיים לבגרות/),
  ).toBeVisible();

  // 60-min price ("180 ₪")
  await expect(page.getByText(/180/).first()).toBeVisible();

  // Calendar empty-state copy (no availability rows seeded)
  await expect(page.getByText("המורה עדיין לא הגדיר/ה זמינות")).toBeVisible();

  // <meta property="og:title"> in head
  const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
  expect(ogTitle).toContain("ד״ר מיכל לוי");

  // <video> element present with non-empty src
  const videoSrc = await page.locator("video").first().getAttribute("src");
  expect(videoSrc).toBeTruthy();
});

test("approved tutor: bio edit preserves discoverability; price edit pauses it (Story 2.5 FR14)", async ({
  page,
}, testInfo) => {
  const {
    provisionInactiveTutor,
    simulateAdminApproval,
    simulateProfileEditOfBio,
    simulateProfileEditOfPrice,
  } = await import("./tutor-discovery.flow");

  const tutor = await provisionInactiveTutor(testInfo);
  if (!tutor) {
    test.skip(true, "DATABASE_URL not set — tutor-discovery fixture cannot run.");
    return;
  }

  await simulateAdminApproval(tutor.userId);

  // 1. Baseline: tutor is discoverable (200) after admin approval.
  const profileUrl = `/tutor/${tutor.userId}`;
  const baseline = await page.goto(profileUrl);
  expect(baseline?.status()).toBe(200);

  // 2. Non-trigger bio edit. Should leave the tutor discoverable AND surface
  //    the new bio on the public profile.
  const newBio = `ביוגרפיה חדשה (Story 2.5 E2E ${Date.now()}) — מורה למתמטיקה.`;
  await simulateProfileEditOfBio(tutor.userId, newBio);

  const afterBioEdit = await page.goto(profileUrl);
  expect(
    afterBioEdit?.status(),
    "non-trigger bio edit should NOT remove the tutor from discoverability",
  ).toBe(200);
  await expect(page.getByText(newBio)).toBeVisible();

  // 3. Trigger price edit. Should flip the discoverability gate so the
  //    public profile 404s.
  await simulateProfileEditOfPrice(tutor.userId, 220);

  const afterPriceEdit = await page.goto(profileUrl);
  expect(
    afterPriceEdit?.status(),
    "trigger price edit should flip is_active=false → public profile 404",
  ).toBe(404);
});

test("anon click on available slot redirects to signup with intent params (Story 3.2)", async ({
  page,
}, testInfo) => {
  const {
    provisionInactiveTutor,
    simulateAdminApproval,
    seedRecurringAvailability,
    clearTutorSeededData,
  } = await import("./tutor-discovery.flow");

  const tutor = await provisionInactiveTutor(testInfo);
  if (!tutor) {
    test.skip(true, "DATABASE_URL not set — tutor-discovery fixture cannot run.");
    return;
  }

  await clearTutorSeededData(tutor.userId);
  await simulateAdminApproval(tutor.userId);
  // Seed recurring availability for every weekday so we don't depend on the
  // test date's weekday. 14:00–18:00 IL across all 7 days.
  for (let weekday = 0; weekday < 7; weekday++) {
    await seedRecurringAvailability(tutor.userId, weekday, "14:00:00", "18:00:00");
  }

  await page.goto(`/tutor/${tutor.userId}?duration=60`);
  // Find the first available slot link (yellow). Each is an <a> with the
  // distinctive bg-tertiary-fixed background. We can match by aria-label too.
  const slotLink = page.locator('a[aria-label^="הזמינו את הזמן"]').first();
  await expect(slotLink).toBeVisible();
  await slotLink.click();

  await page.waitForURL(/\/signup\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("intent")).toBe("book");
  expect(url.searchParams.get("tutorUserId")).toBe(tutor.userId);
  expect(url.searchParams.get("duration")).toBe("60");
  expect(url.searchParams.get("slotIso")).toBeTruthy();
  // HMAC signature on (tutorUserId, slotIso, duration) — Story 3.3 verifies
  // it server-side before issuing a DB lookup. See review decision D1.
  expect(url.searchParams.get("sig")).toBeTruthy();
});
