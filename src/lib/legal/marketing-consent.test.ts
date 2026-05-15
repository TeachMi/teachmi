import { describe, expect, it } from "vitest";
import {
  CURRENT_MARKETING_OPTIN_VERSION,
  MARKETING_OPTIN_LABEL_HE,
} from "./marketing-consent";

describe("marketing-consent constants", () => {
  it("exports a non-empty CURRENT_MARKETING_OPTIN_VERSION", () => {
    expect(typeof CURRENT_MARKETING_OPTIN_VERSION).toBe("string");
    expect(CURRENT_MARKETING_OPTIN_VERSION.length).toBeGreaterThan(0);
  });

  it("exports a non-empty Hebrew marketing label that anchors on the marketing root + optional marker", () => {
    expect(typeof MARKETING_OPTIN_LABEL_HE).toBe("string");
    expect(MARKETING_OPTIN_LABEL_HE.length).toBeGreaterThan(0);
    // The Hebrew root for "marketing" — locks the label's scope wording so a
    // future copy edit doesn't silently drift into transactional territory.
    expect(MARKETING_OPTIN_LABEL_HE).toMatch(/שיווק/);
    // The "(אופציונלי)" marker locks the opt-in semantics — the marketing
    // box must read as visibly optional to satisfy AC1. A rewrite that strips
    // the parenthetical would make the checkbox indistinguishable from the
    // regulatory ones above it. [Code review round 1, P-3.]
    expect(MARKETING_OPTIN_LABEL_HE).toMatch(/אופציונלי/);
  });
});
