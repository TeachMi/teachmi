import { test } from "@playwright/test";
import { completeStudentLoop, emulateApproximate3G } from "./student-loop.flow";

test("student loop stays reachable on an approximate 3G network", async (
  { browserName, page },
  testInfo,
) => {
  test.skip(browserName !== "chromium", "Chromium CDP is required for network emulation.");

  await emulateApproximate3G(page);
  await completeStudentLoop(page, testInfo);
});
