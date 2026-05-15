import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireAuth: (cb?: string) => mockRequireAuth(cb),
}));

interface FakeDbState {
  inserts: Array<{ table: unknown; values: unknown }>;
  updates: Array<{ table: unknown; values: unknown; where: unknown }>;
  shouldThrowOnUpdate: Error | null;
  shouldThrowOnInsert: Error | null;
}

const dbState: FakeDbState = {
  inserts: [],
  updates: [],
  shouldThrowOnUpdate: null,
  shouldThrowOnInsert: null,
};

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        if (dbState.shouldThrowOnInsert) throw dbState.shouldThrowOnInsert;
        dbState.inserts.push({ table, values });
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async (where: unknown) => {
          if (dbState.shouldThrowOnUpdate) throw dbState.shouldThrowOnUpdate;
          dbState.updates.push({ table, values, where });
        },
      }),
    }),
  }),
}));

const presignPut = vi.fn();
const presignGet = vi.fn();
vi.mock("@/lib/providers/files", () => ({
  getFilesProvider: () => ({
    generatePresignedPutUrl: presignPut,
    generatePresignedGetUrl: presignGet,
  }),
  isStubUrl: (u: string) => u.startsWith("https://stub.r2.local/"),
}));

import {
  confirmProfilePhotoUploadAction,
  requestProfilePhotoUploadUrlAction,
  resolveProfilePhotoUrl,
} from "../upload-actions";

const USER_ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  mockRequireAuth.mockResolvedValue({ id: USER_ID, name: "Test", email: "t@x.com" });
  dbState.inserts.length = 0;
  dbState.updates.length = 0;
  dbState.shouldThrowOnUpdate = null;
  dbState.shouldThrowOnInsert = null;
  presignPut.mockReset();
  presignGet.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("requestProfilePhotoUploadUrlAction", () => {
  it("issues a presigned PUT URL for a valid image/jpeg under 5MB", async () => {
    presignPut.mockResolvedValue({
      uploadUrl: "https://stub.r2.local/student-profile-photos/photos/u/x.jpg?fake-put",
      expiresAt: new Date("2026-06-15T10:00:00.000Z"),
    });

    const res = await requestProfilePhotoUploadUrlAction({
      contentType: "image/jpeg",
      sizeBytes: 100_000,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.r2Key.startsWith(`photos/${USER_ID}/`)).toBe(true);
    expect(res.r2Key.endsWith(".jpg")).toBe(true);
    expect(res.uploadUrl).toContain("stub.r2.local");
    expect(presignPut).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: "student-profile-photos" }),
    );
    // Audit row written best-effort.
    expect(dbState.inserts).toHaveLength(1);
  });

  it("rejects unsupported MIME (image/gif)", async () => {
    const res = await requestProfilePhotoUploadUrlAction({
      contentType: "image/gif",
      sizeBytes: 100_000,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.formError).toContain("סוג קובץ לא נתמך");
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("rejects sizes over 5MB", async () => {
    const res = await requestProfilePhotoUploadUrlAction({
      contentType: "image/jpeg",
      sizeBytes: 6_000_000,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.formError).toContain("5MB");
  });

  it("rejects zero/negative sizes", async () => {
    const res = await requestProfilePhotoUploadUrlAction({
      contentType: "image/jpeg",
      sizeBytes: 0,
    });
    expect(res.ok).toBe(false);
  });

  it("uses the right extension for image/png and image/webp", async () => {
    presignPut.mockResolvedValue({
      uploadUrl: "https://stub.r2.local/x",
      expiresAt: new Date(),
    });

    const png = await requestProfilePhotoUploadUrlAction({
      contentType: "image/png",
      sizeBytes: 1_000,
    });
    expect(png.ok).toBe(true);
    if (png.ok) expect(png.r2Key.endsWith(".png")).toBe(true);

    const webp = await requestProfilePhotoUploadUrlAction({
      contentType: "image/webp",
      sizeBytes: 1_000,
    });
    expect(webp.ok).toBe(true);
    if (webp.ok) expect(webp.r2Key.endsWith(".webp")).toBe(true);
  });
});

describe("confirmProfilePhotoUploadAction", () => {
  it("writes users.profile_photo_r2_key on a valid owner-prefixed key", async () => {
    presignGet.mockResolvedValue("https://stub.r2.local/student-profile-photos/photos/u/x.jpg?fake-get");

    const res = await confirmProfilePhotoUploadAction({
      r2Key: `photos/${USER_ID}/abc.jpg`,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.r2Key).toBe(`photos/${USER_ID}/abc.jpg`);
    expect(dbState.updates).toHaveLength(1);
    const setShape = dbState.updates[0]!.values as Record<string, unknown>;
    expect(setShape.profilePhotoR2Key).toBe(`photos/${USER_ID}/abc.jpg`);
    expect(setShape.updatedByKind).toBe("user");
    expect(setShape.updatedByActor).toBe(USER_ID);
  });

  it("refuses a key not under the caller's photos/<userId>/ prefix", async () => {
    const res = await confirmProfilePhotoUploadAction({
      r2Key: "photos/22222222-3333-4444-5555-666666666666/stolen.jpg",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.formError).toContain("לא תקין");
    expect(dbState.updates).toHaveLength(0);
  });

  it("refuses an empty r2Key", async () => {
    const res = await confirmProfilePhotoUploadAction({ r2Key: "  " });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.formError).toContain("חסר");
  });

  it("returns formError when the users update throws", async () => {
    dbState.shouldThrowOnUpdate = new Error("Neon unreachable");
    const res = await confirmProfilePhotoUploadAction({
      r2Key: `photos/${USER_ID}/abc.jpg`,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.formError).toContain("שגיאה");
    expect(dbState.updates).toHaveLength(0);
  });
});

describe("resolveProfilePhotoUrl", () => {
  it("returns null for null/undefined r2Key", async () => {
    expect(await resolveProfilePhotoUrl(null)).toBeNull();
    expect(await resolveProfilePhotoUrl(undefined)).toBeNull();
    expect(await resolveProfilePhotoUrl("")).toBeNull();
  });

  it("returns null when the provider yields a stub URL (browser can't fetch)", async () => {
    presignGet.mockResolvedValue("https://stub.r2.local/student-profile-photos/photos/u/x.jpg?fake-get");
    const url = await resolveProfilePhotoUrl(`photos/${USER_ID}/x.jpg`);
    expect(url).toBeNull();
  });

  it("returns the URL when the provider yields a real (non-stub) URL", async () => {
    presignGet.mockResolvedValue("https://r2.example.com/student-profile-photos/photos/u/x.jpg?sig=abc");
    const url = await resolveProfilePhotoUrl(`photos/${USER_ID}/x.jpg`);
    expect(url).toBe("https://r2.example.com/student-profile-photos/photos/u/x.jpg?sig=abc");
  });

  it("returns null when the presign throws (fail-OPEN)", async () => {
    presignGet.mockRejectedValue(new Error("network"));
    const url = await resolveProfilePhotoUrl(`photos/${USER_ID}/x.jpg`);
    expect(url).toBeNull();
  });
});
