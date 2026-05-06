import { describe, expect, it } from "vitest";
import { defaultPostSignInPath, getSafeCallbackUrl } from "../callback-url";

describe("auth callback URLs", () => {
  it("keeps relative callback paths including query strings", () => {
    expect(getSafeCallbackUrl("/dashboard?tab=lessons")).toBe("/dashboard?tab=lessons");
  });

  it("defaults unsafe or empty callback URLs to the dashboard", () => {
    expect(getSafeCallbackUrl("https://evil.example/dashboard")).toBe(defaultPostSignInPath);
    expect(getSafeCallbackUrl("//evil.example/dashboard")).toBe(defaultPostSignInPath);
    expect(getSafeCallbackUrl("")).toBe(defaultPostSignInPath);
    expect(getSafeCallbackUrl(null)).toBe(defaultPostSignInPath);
  });
});
