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
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "יצירת חשבון תלמיד" })).toBeVisible();

  await page.getByLabel("שם מלא").fill("תלמיד בדיקה");
  await page.getByLabel("אימייל").fill(buildStudentEmail(testInfo));
  await page.getByRole("button", { name: "המשך לחיפוש מורים" }).click();

  await expect(page).toHaveURL(/\/browse/);
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
