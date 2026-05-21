import { describe, expect, it } from "vitest";
import {
  buildHeroSearchUrl,
  LENGTH_ANY,
  SUBJECT_ALL,
} from "../HeroSearch";

// The hero search's only logic is composing the `/browse` URL. The
// component defaults are subject = SUBJECT_ALL, length = "60".

describe("buildHeroSearchUrl", () => {
  it("emits ?length=60 for the page defaults (all subjects, 60-min)", () => {
    expect(buildHeroSearchUrl(SUBJECT_ALL, "60")).toBe("/browse?length=60");
  });

  it("adds the subject slug when a subject is picked", () => {
    expect(buildHeroSearchUrl("mathematics", "60")).toBe(
      "/browse?subject=mathematics&length=60",
    );
  });

  it("drops the length param when 'any length' is chosen", () => {
    expect(buildHeroSearchUrl("mathematics", LENGTH_ANY)).toBe(
      "/browse?subject=mathematics",
    );
  });

  it("returns a bare /browse when nothing is filtered", () => {
    expect(buildHeroSearchUrl(SUBJECT_ALL, LENGTH_ANY)).toBe("/browse");
  });
});
