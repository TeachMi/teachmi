import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getFilesProvider } from "..";
import { R2FilesProvider } from "../r2";
import { StubFilesProvider } from "../stub";

describe("getFilesProvider", () => {
  const originalEnv = process.env.FILES_PROVIDER;

  beforeEach(() => {
    delete process.env.FILES_PROVIDER;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.FILES_PROVIDER;
    } else {
      process.env.FILES_PROVIDER = originalEnv;
    }
  });

  it("defaults to StubFilesProvider when FILES_PROVIDER is unset", () => {
    expect(getFilesProvider()).toBeInstanceOf(StubFilesProvider);
  });

  it("returns StubFilesProvider when FILES_PROVIDER=stub", () => {
    process.env.FILES_PROVIDER = "stub";
    expect(getFilesProvider()).toBeInstanceOf(StubFilesProvider);
  });

  it("trims whitespace + handles empty string as stub", () => {
    process.env.FILES_PROVIDER = "   ";
    expect(getFilesProvider()).toBeInstanceOf(StubFilesProvider);
  });

  it("returns R2FilesProvider when FILES_PROVIDER=r2", () => {
    process.env.FILES_PROVIDER = "r2";
    expect(getFilesProvider()).toBeInstanceOf(R2FilesProvider);
  });

  it("throws on unrecognized value", () => {
    process.env.FILES_PROVIDER = "s3";
    expect(() => getFilesProvider()).toThrowError(/Invalid value for FILES_PROVIDER/);
  });
});
