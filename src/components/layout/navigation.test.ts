import { describe, expect, it } from "vitest";
import { getAccountHomeHref, legalLinks } from "./navigation";

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

describe("getAccountHomeHref — role-aware avatar destination (Story 2.10)", () => {
  it("admin → /admin", () => {
    expect(getAccountHomeHref("admin")).toEqual({
      href: "/admin",
      ariaLabel: "אזור ניהול",
    });
  });

  it("tutor → /tutor/me (NOT /account/profile, which is student-only)", () => {
    expect(getAccountHomeHref("tutor")).toEqual({
      href: "/tutor/me",
      ariaLabel: "אזור המורה",
    });
  });

  it("student → /account/profile", () => {
    expect(getAccountHomeHref("student")).toEqual({
      href: "/account/profile",
      ariaLabel: "החשבון שלי",
    });
  });

  it("null role → defaults to /account/profile (anonymous fall-through; never actually rendered because SiteHeader gates on user truthy)", () => {
    expect(getAccountHomeHref(null).href).toBe("/account/profile");
  });

  it("undefined role → defaults to /account/profile", () => {
    expect(getAccountHomeHref(undefined).href).toBe("/account/profile");
  });
});
