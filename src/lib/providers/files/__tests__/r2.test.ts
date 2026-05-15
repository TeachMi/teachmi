import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveBucketName } from "../r2";

describe("resolveBucketName", () => {
  const originalSuffix = process.env.R2_BUCKET_SUFFIX;

  beforeEach(() => {
    delete process.env.R2_BUCKET_SUFFIX;
  });

  afterEach(() => {
    if (originalSuffix === undefined) {
      delete process.env.R2_BUCKET_SUFFIX;
    } else {
      process.env.R2_BUCKET_SUFFIX = originalSuffix;
    }
  });

  it("returns the logical name unchanged when no suffix is set (prod)", () => {
    expect(resolveBucketName("student-profile-photos")).toBe("student-profile-photos");
  });

  it("appends the suffix (e2e / preview / dev)", () => {
    process.env.R2_BUCKET_SUFFIX = "-e2e";
    expect(resolveBucketName("student-profile-photos")).toBe(
      "student-profile-photos-e2e",
    );
    expect(resolveBucketName("tutor-profile-photos")).toBe("tutor-profile-photos-e2e");
    expect(resolveBucketName("tutor-intro-videos")).toBe("tutor-intro-videos-e2e");
  });

  it("treats empty suffix as prod (no append)", () => {
    process.env.R2_BUCKET_SUFFIX = "";
    expect(resolveBucketName("student-profile-photos")).toBe("student-profile-photos");
  });
});
