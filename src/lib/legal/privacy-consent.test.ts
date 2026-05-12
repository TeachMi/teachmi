import { describe, expect, it, vi } from "vitest";
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  USER_AGENT_MAX_LENGTH,
  buildPrivacyAcceptRedirectUrl,
  requirePrivacyConsent,
  truncateUserAgent,
  userNeedsPrivacyConsent,
  type DbForPrivacyConsent,
} from "./privacy-consent";

function makeFakeDb(
  rows: Array<{ documentVersion: string }>,
): { db: DbForPrivacyConsent; calls: { where: unknown; limit: number }[] } {
  const calls: { where: unknown; limit: number }[] = [];
  const db: DbForPrivacyConsent = {
    select: () => ({
      from: () => ({
        where: (cond: unknown) => ({
          orderBy: () => ({
            limit: (n: number) => {
              calls.push({ where: cond, limit: n });
              return Promise.resolve(rows);
            },
          }),
        }),
      }),
    }),
  };
  return { db, calls };
}

describe("userNeedsPrivacyConsent", () => {
  it("returns true for null receipt", () => {
    expect(userNeedsPrivacyConsent(null)).toBe(true);
  });

  it("returns true for undefined receipt", () => {
    expect(userNeedsPrivacyConsent(undefined)).toBe(true);
  });

  it("returns false when documentVersion matches current", () => {
    expect(
      userNeedsPrivacyConsent({
        documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
      }),
    ).toBe(false);
  });

  it("returns true when documentVersion is older", () => {
    expect(
      userNeedsPrivacyConsent({ documentVersion: "ancient-2025-01-01" }),
    ).toBe(true);
  });
});

describe("truncateUserAgent", () => {
  it("returns null for null", () => {
    expect(truncateUserAgent(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(truncateUserAgent(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(truncateUserAgent("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(truncateUserAgent("   ")).toBeNull();
  });

  it("returns short strings unchanged", () => {
    expect(truncateUserAgent("Mozilla/5.0 short")).toBe("Mozilla/5.0 short");
  });

  it("trims surrounding whitespace", () => {
    expect(truncateUserAgent("  Mozilla/5.0  ")).toBe("Mozilla/5.0");
  });

  it("truncates strings over the default cap to exactly 512 chars", () => {
    const huge = "x".repeat(1000);
    const out = truncateUserAgent(huge);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(USER_AGENT_MAX_LENGTH);
    expect(out).toBe("x".repeat(USER_AGENT_MAX_LENGTH));
  });

  it("honors a caller-supplied maxLength", () => {
    expect(truncateUserAgent("abcdef", 3)).toBe("abc");
  });
});

describe("buildPrivacyAcceptRedirectUrl", () => {
  it("URL-encodes the next path", () => {
    expect(buildPrivacyAcceptRedirectUrl("/dashboard")).toBe(
      "/legal/privacy/accept?next=%2Fdashboard",
    );
    expect(buildPrivacyAcceptRedirectUrl("/tutor/onboarding/profile")).toBe(
      "/legal/privacy/accept?next=%2Ftutor%2Fonboarding%2Fprofile",
    );
  });

  it("URL-encodes query-string-bearing paths", () => {
    expect(buildPrivacyAcceptRedirectUrl("/dashboard?tab=upcoming")).toBe(
      "/legal/privacy/accept?next=%2Fdashboard%3Ftab%3Dupcoming",
    );
  });
});

describe("requirePrivacyConsent", () => {
  it("does not redirect when the user has a receipt at the current version", async () => {
    const { db, calls } = makeFakeDb([
      { documentVersion: CURRENT_PRIVACY_POLICY_VERSION },
    ]);
    const redirectFn = vi.fn(() => {
      throw new Error("should not redirect");
    }) as (path: string) => never;

    await requirePrivacyConsent({
      userId: "user-1",
      currentPath: "/dashboard",
      db,
      redirectFn,
    });

    expect(redirectFn).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.limit).toBe(1);
  });

  it("redirects to /legal/privacy/accept when no receipt exists", async () => {
    const { db } = makeFakeDb([]);
    const redirectFn = vi.fn(() => {
      throw new Error("redirect");
    }) as (path: string) => never;

    await expect(
      requirePrivacyConsent({
        userId: "user-1",
        currentPath: "/dashboard",
        db,
        redirectFn,
      }),
    ).rejects.toThrow("redirect");

    expect(redirectFn).toHaveBeenCalledWith(
      "/legal/privacy/accept?next=%2Fdashboard",
    );
  });

  it("redirects when the most recent receipt is from an older version", async () => {
    const { db } = makeFakeDb([{ documentVersion: "stale-v0" }]);
    const redirectFn = vi.fn(() => {
      throw new Error("redirect");
    }) as (path: string) => never;

    await expect(
      requirePrivacyConsent({
        userId: "user-1",
        currentPath: "/dashboard",
        db,
        redirectFn,
      }),
    ).rejects.toThrow("redirect");

    expect(redirectFn).toHaveBeenCalledWith(
      "/legal/privacy/accept?next=%2Fdashboard",
    );
  });
});
