import { test } from "@playwright/test";
import { completeStudentLoop } from "./student-loop.flow";

test("student can sign up, browse, and open the booking stub", async ({ page }, testInfo) => {
  await completeStudentLoop(page, testInfo);
});
