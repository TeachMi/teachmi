import { describe, expect, it } from "vitest";
import { StubGovIlProvider } from "../stub";

describe("StubGovIlProvider", () => {
  const provider = new StubGovIlProvider();

  describe("buildOsekZairUrl", () => {
    it("returns a stub gov.il Osek Zair URL with a base64url-encoded token", () => {
      const url = provider.buildOsekZairUrl({
        fullName: "ישראל ישראלי",
        idNumber: "123456789",
        birthDate: "1990-01-01",
        email: "tutor@example.com",
        address: "רחוב הרצל 1, תל אביב",
        activityCodes: ["8559"],
        expectedIncomeAgorot: 5000000,
      });

      expect(url).toMatch(/^https:\/\/stub\.gov\.il\/osek-zair\?token=stub-[A-Za-z0-9_-]+$/);
    });

    it("produces identical URLs for identical payloads", () => {
      const payload = {
        fullName: "ישראל ישראלי",
        idNumber: "111",
        birthDate: "1990-01-01",
        email: "a@b.com",
        address: "רחוב 1",
        activityCodes: ["8559"],
        expectedIncomeAgorot: 100000,
      };
      expect(provider.buildOsekZairUrl(payload)).toBe(provider.buildOsekZairUrl(payload));
    });
  });

  describe("buildBL6101Url", () => {
    it("returns a stub BL form 6101 URL with a token query param", () => {
      const url = provider.buildBL6101Url({
        fullName: "תלמיד ת.",
        idNumber: "222333444",
        email: "x@y.com",
        familyStatus: "married",
        existingOsekStartDate: "2024-01-01",
      });

      expect(url).toMatch(/^https:\/\/stub\.gov\.il\/bl-form-6101\?token=stub-[A-Za-z0-9_-]+$/);
    });
  });

  describe("verifyReturnPayload", () => {
    it("accepts payloads built by buildOsekZairUrl and round-trips the data", () => {
      const url = provider.buildOsekZairUrl({
        fullName: "ישראל ישראלי",
        idNumber: "123",
        birthDate: "1990-01-01",
        email: "a@b.com",
        address: "אדר 1",
        activityCodes: ["8559"],
        expectedIncomeAgorot: 100000,
      });
      const tokenStart = url.indexOf("token=") + "token=".length;
      const token = url.slice(tokenStart);

      const result = provider.verifyReturnPayload(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toMatchObject({ kind: "osek-zair" });
    });

    it("rejects payloads not prefixed with 'stub-'", () => {
      expect(provider.verifyReturnPayload("real-gov-il-token")).toEqual({ valid: false });
    });

    it("rejects malformed stub-prefixed payloads", () => {
      expect(provider.verifyReturnPayload("stub-not-base64-or-json!!!")).toEqual({
        valid: false,
      });
    });

    it("rejects payloads whose decoded body is not a plain object (null, array, primitive)", () => {
      // base64url("null") = "bnVsbA"; base64url("[]") = "W10"; base64url("42") = "NDI"
      expect(provider.verifyReturnPayload("stub-bnVsbA")).toEqual({ valid: false });
      expect(provider.verifyReturnPayload("stub-W10")).toEqual({ valid: false });
      expect(provider.verifyReturnPayload("stub-NDI")).toEqual({ valid: false });
    });
  });
});
