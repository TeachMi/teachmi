import { describe, expect, it } from "vitest";
import { StubFilesProvider } from "../stub";

describe("StubFilesProvider", () => {
  const provider = new StubFilesProvider();

  describe("generatePresignedPutUrl", () => {
    it("returns a stub upload URL containing bucket + key + fake-sig query", async () => {
      const result = await provider.generatePresignedPutUrl({
        bucket: "tutor-intro-videos",
        key: "intros/abc-123/01HQXY.mp4",
        contentType: "video/mp4",
        maxSizeBytes: 50_000_000,
        expiresInSec: 600,
      });

      expect(result.uploadUrl).toMatch(
        /^https:\/\/stub\.r2\.local\/tutor-intro-videos\/intros\/abc-123\/01HQXY\.mp4\?fake-sig=stub-600-video%2Fmp4-50000000$/,
      );
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("escapes key segments via encodeURIComponent (handles Hebrew filenames defensively)", async () => {
      const result = await provider.generatePresignedPutUrl({
        bucket: "tutor-profile-photos",
        key: "photos/user/ש לום.png",
        contentType: "image/png",
        maxSizeBytes: 5_000_000,
        expiresInSec: 60,
      });
      // each "/" segment encodeURIComponent'd — space becomes %20, Hebrew letters %XX...
      expect(result.uploadUrl).toContain("photos/user/");
      expect(result.uploadUrl).toContain("%20"); // space encoded
      expect(result.uploadUrl).not.toContain(" "); // raw space rejected
    });

    it.each([
      [
        "rejects unknown bucket",
        { bucket: "wrong-bucket" as never, key: "x", contentType: "video/mp4", maxSizeBytes: 1, expiresInSec: 1 },
        /bucket must be one of/,
      ],
      [
        "rejects empty key",
        { bucket: "tutor-intro-videos" as const, key: "  ", contentType: "video/mp4", maxSizeBytes: 1, expiresInSec: 1 },
        /key must be non-empty/,
      ],
      [
        "rejects non-positive maxSizeBytes",
        { bucket: "tutor-intro-videos" as const, key: "k", contentType: "video/mp4", maxSizeBytes: 0, expiresInSec: 1 },
        /maxSizeBytes must be positive/,
      ],
      [
        "rejects non-positive expiresInSec",
        { bucket: "tutor-intro-videos" as const, key: "k", contentType: "video/mp4", maxSizeBytes: 1, expiresInSec: 0 },
        /expiresInSec must be positive/,
      ],
      [
        "rejects empty contentType",
        { bucket: "tutor-intro-videos" as const, key: "k", contentType: "", maxSizeBytes: 1, expiresInSec: 1 },
        /contentType must be non-empty/,
      ],
    ])("%s", async (_name, input, message) => {
      await expect(provider.generatePresignedPutUrl(input)).rejects.toThrowError(message);
    });
  });

  describe("generatePresignedGetUrl", () => {
    it("returns a stub GET URL with fake-get param", async () => {
      const url = await provider.generatePresignedGetUrl({
        bucket: "tutor-intro-videos",
        key: "intros/abc/k.mp4",
        expiresInSec: 300,
      });
      expect(url).toBe("https://stub.r2.local/tutor-intro-videos/intros/abc/k.mp4?fake-get=300");
    });

    it.each([
      ["rejects unknown bucket", { bucket: "x" as never, key: "k", expiresInSec: 1 }, /bucket must be one of/],
      ["rejects empty key", { bucket: "tutor-intro-videos" as const, key: "", expiresInSec: 1 }, /key must be non-empty/],
      [
        "rejects non-positive expiresInSec",
        { bucket: "tutor-intro-videos" as const, key: "k", expiresInSec: 0 },
        /expiresInSec must be positive/,
      ],
    ])("%s", async (_name, input, message) => {
      await expect(provider.generatePresignedGetUrl(input)).rejects.toThrowError(message);
    });
  });

  describe("deleteObject", () => {
    it("resolves silently on a valid bucket + key (no-op)", async () => {
      await expect(
        provider.deleteObject({ bucket: "tutor-intro-videos", key: "intros/x/k.mp4" }),
      ).resolves.toBeUndefined();
    });

    it("rejects unknown bucket", async () => {
      await expect(
        provider.deleteObject({ bucket: "wrong" as never, key: "k" }),
      ).rejects.toThrowError(/bucket must be one of/);
    });

    it("rejects empty key", async () => {
      await expect(
        provider.deleteObject({ bucket: "tutor-intro-videos", key: "" }),
      ).rejects.toThrowError(/key must be non-empty/);
    });
  });
});
