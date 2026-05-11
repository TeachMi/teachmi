import { expect, type Page, type TestInfo } from "@playwright/test";

export function buildStudentEmail(testInfo: TestInfo): string {
  const runId = process.env.GITHUB_RUN_ID ?? "local";
  const normalizedTitle = testInfo.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);

  return `student-loop+${runId}-${normalizedTitle || "smoke"}@example.test`;
}

export async function completeStudentLoop(page: Page, testInfo: TestInfo): Promise<void> {
  // Reference the helper so it's not flagged as unused once full signup is wired.
  void testInfo;
  void buildStudentEmail;

  // Smoke-check the new signup page renders (Hebrew RTL + post-Story-1.13 heading).
  // We deliberately do NOT submit the form here: signup is now a real Server
  // Action that creates a `users` row + verification token + audit rows, and
  // the verify-link click that completes the loop requires either DB access to
  // the `_dev_email_outbox` (to pull the token) or a verified-user fixture —
  // neither is wired yet. The signup orchestration itself is covered by the
  // integration tests in `src/app/signup/__tests__/registration-flow.test.ts`,
  // `resend-flow.test.ts`, and `verify-flow.test.ts` (FakeDb-based, no real Neon).
  // When Story 1.14 (signin) lands a programmatic-login test fixture, restore
  // the full loop here.
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "ברוכים הבאים ל-TeachMe" })).toBeVisible();

  await page.goto("/browse");
  await expect(page.getByRole("heading", { name: "מורים זמינים לשיעור ראשון" })).toBeVisible();

  const tutorCard = page.getByRole("article", { name: "נועה לוי - מתמטיקה - 5 יחידות" });
  await expect(tutorCard).toBeVisible();
  await tutorCard.getByRole("link", { name: "הזמנת שיעור עם נועה לוי" }).click();

  await expect(page).toHaveURL(/\/booking-stub\?tutor=noa-levi/);
  await expect(page.getByRole("heading", { name: "בקשת שיעור התקבלה" })).toBeVisible();
  await expect(page.getByText("נועה לוי")).toBeVisible();
}

export async function emulateApproximate3G(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");

  const conditions = {
    offline: false,
    latency: 300,
    downloadThroughput: (2 * 1024 * 1024) / 8,
    uploadThroughput: (1 * 1024 * 1024) / 8,
    connectionType: "cellular3g" as const,
  };

  try {
    await client.send("Network.emulateNetworkConditionsByRule", {
      offline: false,
      matchedNetworkConditions: [
        {
          urlPattern: "",
          ...conditions,
        },
      ],
    });
    await client.send("Network.overrideNetworkState", conditions);
  } catch {
    await client.send("Network.emulateNetworkConditions", conditions);
  }
}
