import { describe, expect, it } from "vitest";
import {
  DATA_EXPORT_TOKEN_TTL_HOURS,
  buildDataExportUrl,
  dataExportExpiresAt,
  dataExportFilename,
  generateDataExportToken,
} from "../data-export";

describe("data export helpers", () => {
  it("generates URL-safe high-entropy tokens", () => {
    const token = generateDataExportToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("uses a 24-hour expiry window", () => {
    const now = new Date("2026-05-14T10:00:00.000Z");

    expect(dataExportExpiresAt(now).toISOString()).toBe("2026-05-15T10:00:00.000Z");
    expect(DATA_EXPORT_TOKEN_TTL_HOURS).toBe(24);
  });

  it("builds the signed download URL from the provided origin", () => {
    expect(buildDataExportUrl("abc_123", "https://preview.teachme.app")).toBe(
      "https://preview.teachme.app/api/data-export/abc_123",
    );
  });

  it("uses an ASCII attachment filename", () => {
    expect(dataExportFilename("user-1")).toBe("teachme-data-export-user-1.json");
  });
});
