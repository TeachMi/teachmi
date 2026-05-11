import { expect, test, type Page, type TestInfo } from "@playwright/test";

export function buildStudentEmail(testInfo: TestInfo): string {
  const runId = process.env.GITHUB_RUN_ID ?? "local";
  const normalizedTitle = testInfo.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);

  // Story 1.14 code-review: include workerIndex so parallel Playwright workers
  // don't collide on the same "user" + sessions rows when GITHUB_RUN_ID is the
  // fallback `"local"` (multiple devs against a shared Neon dev branch).
  const worker = testInfo.workerIndex;

  return `student-loop+${runId}-w${worker}-${normalizedTitle || "smoke"}@example.test`;
}

export async function completeStudentLoop(page: Page, testInfo: TestInfo): Promise<void> {
  // Smoke-check the new signup page renders (Hebrew RTL + post-Story-1.13 heading).
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "ברוכים הבאים ל-TeachMe" })).toBeVisible();

  // Story 1.14 — programmatic-login fixture. Bypasses the signin UI (which is
  // exercised by integration tests + a page-render smoke check elsewhere). The
  // fixture inserts a verified user + active session row via Drizzle, then we
  // attach the session cookie before continuing the loop. If DATABASE_URL is
  // unset (local dev), we skip the full loop gracefully — the signup-render
  // assertion above still runs and catches build/render regressions.
  const { createVerifiedSession, getSessionCookieName } = await import("./signin-fixture");
  const verified = await createVerifiedSession(testInfo);
  if (!verified) {
    test.skip(
      true,
      "DATABASE_URL not set — programmatic-login fixture cannot run; skipping full golden-path loop. (Set DATABASE_URL to run end-to-end.)",
    );
    return;
  }

  // Use `url` (not `domain`) so Playwright resolves the host from the URL —
  // avoids the localhost ↔ 127.0.0.1 cross-navigation drop where a fixed
  // domain would refuse to set on the other hostname.
  await page.context().addCookies([
    {
      name: getSessionCookieName(),
      value: verified.sessionToken,
      url: page.url(),
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(verified.expiresMs / 1000),
    },
  ]);

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
