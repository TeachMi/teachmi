import { describe, expect, it } from "vitest";
import { legalLinks } from "./navigation";

describe("legalLinks", () => {
  it("keeps the four stable legal footer paths", () => {
    expect(legalLinks.map((link) => link.href)).toEqual([
      "/legal/terms",
      "/legal/privacy",
      "/legal/tutor-agreement",
      "/legal/code-of-conduct",
    ]);
  });
});
