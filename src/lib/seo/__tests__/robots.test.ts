import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIndexableRobotsDirective } from "../robots";

const originalNodeEnv = process.env.NODE_ENV;
const originalAllowIndex = process.env.ALLOW_PUBLIC_INDEX;

afterEach(() => {
  vi.unstubAllEnvs();
  // Restore in case anything direct-mutated.
  if (originalNodeEnv === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
  } else {
    (process.env as Record<string, string>).NODE_ENV = originalNodeEnv;
  }
  if (originalAllowIndex === undefined) {
    delete process.env.ALLOW_PUBLIC_INDEX;
  } else {
    process.env.ALLOW_PUBLIC_INDEX = originalAllowIndex;
  }
});

describe("buildIndexableRobotsDirective", () => {
  it("returns {index:false, follow:false} when NODE_ENV !== 'production'", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ALLOW_PUBLIC_INDEX", "true");
    expect(buildIndexableRobotsDirective()).toEqual({ index: false, follow: false });
  });

  it("returns {index:false, follow:false} when production but ALLOW_PUBLIC_INDEX is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_PUBLIC_INDEX", "");
    expect(buildIndexableRobotsDirective()).toEqual({ index: false, follow: false });
  });

  it("returns {index:false, follow:false} when production but ALLOW_PUBLIC_INDEX != 'true' (e.g. '1')", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_PUBLIC_INDEX", "1");
    expect(buildIndexableRobotsDirective()).toEqual({ index: false, follow: false });
  });

  it("returns {index:true, follow:true} when both gates pass", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_PUBLIC_INDEX", "true");
    expect(buildIndexableRobotsDirective()).toEqual({ index: true, follow: true });
  });
});
