import { describe, expect, it, vi, beforeEach } from "vitest";

// Sentinels for next/navigation. `notFound()` and `redirect()` both throw
// internal Next errors at runtime; we replace them with recognizable thrown
// markers so the tests can branch on which control-flow path fired.
const NOT_FOUND_SENTINEL = "NEXT_NOT_FOUND_THROWN_IN_TEST";
const REDIRECT_PREFIX = "NEXT_REDIRECT_THROWN_IN_TEST:";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND_SENTINEL);
  },
  redirect: (url: string) => {
    throw new Error(`${REDIRECT_PREFIX}${url}`);
  },
}));

const mockAuth = vi.fn();
vi.mock("@/lib/auth/auth", () => ({
  auth: () => mockAuth(),
}));

const mockGetOwner = vi.fn();
vi.mock("@/lib/db/queries/tutor-queries", () => ({
  getTutorProfileForOwner: (...args: unknown[]) => mockGetOwner(...args),
}));

const mockGetDb = vi.fn(() => ({
  select: () => ({
    from: () => ({
      where: () => Promise.resolve([]),
      innerJoin: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
  }),
}));
vi.mock("@/lib/db/client", () => ({
  getDb: () => mockGetDb(),
}));

const mockGetPreviewUrls = vi.fn<
  (input: unknown) => Promise<{
    photoUrl: string | null;
    introVideoUrl: string | null;
  }>
>(async () => ({ photoUrl: null, introVideoUrl: null }));

vi.mock("../../../onboarding/profile/upload-actions", () => ({
  getTutorProfilePreviewUrls: (input: unknown) => mockGetPreviewUrls(input),
}));

const editProfileActionMock = vi.fn();
vi.mock("../actions", () => ({
  editProfileAction: editProfileActionMock,
}));

// Hoist the spy so the vi.mock factory below sees it (mock factories are
// hoisted above other top-level statements by vitest).
const profileFormSpy = vi.hoisted(() => vi.fn(() => null));
vi.mock("../../../onboarding/profile/ProfileForm", () => ({
  ProfileForm: profileFormSpy,
}));

// The page returns a JSX tree without invoking ProfileForm (no renderer). Walk
// the returned tree to find the element whose `type === profileFormSpy` and
// return its props. Same pattern Story 3.2's page.test.tsx uses.
function findPropsByType(
  tree: unknown,
  type: unknown,
): Record<string, unknown> | null {
  if (!tree || typeof tree !== "object") return null;
  const node = tree as { type?: unknown; props?: Record<string, unknown> };
  if (node.type === type) return node.props ?? {};
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findPropsByType(child, type);
      if (found) return found;
    }
    return null;
  }
  if (children !== undefined) return findPropsByType(children, type);
  return null;
}

// Import AFTER mocks.
const { default: TutorProfileEditPage } = await import("../page");

const TUTOR_UUID = "11111111-2222-3333-4444-555555555555";
const ANOTHER_UUID = "99999999-9999-9999-9999-999999999999";
const NOT_A_UUID = "not-a-uuid";

const APPROVED_PROFILE = {
  userId: TUTOR_UUID,
  displayName: "ד״ר מיכל לוי",
  bio: "מורה למתמטיקה.",
  city: "תל אביב",
  introVideoR2Key: `intros/${TUTOR_UUID}/v1.mp4`,
  profilePhotoR2Key: `photos/${TUTOR_UUID}/v1.png`,
  hourlyPriceIls: 180,
  lesson45PriceIls: 140,
  lessonLengthMinutes: 60,
  vettingStatus: "approved" as const,
  isActive: true,
};

beforeEach(() => {
  mockAuth.mockReset();
  mockGetOwner.mockReset();
  mockGetPreviewUrls.mockClear();
  profileFormSpy.mockClear();
});

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("/tutor/[slug]/edit — ownership guard", () => {
  it("anonymous visitor → redirect to /signin with callbackUrl", async () => {
    mockAuth.mockResolvedValueOnce(null);

    let thrown: unknown;
    try {
      await TutorProfileEditPage(makeParams(TUTOR_UUID));
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toBe(
      `${REDIRECT_PREFIX}/signin?callbackUrl=/tutor/${TUTOR_UUID}/edit`,
    );
  });

  it("authenticated non-owner → notFound() (info-leak guard)", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: ANOTHER_UUID } });

    let thrown: unknown;
    try {
      await TutorProfileEditPage(makeParams(TUTOR_UUID));
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toBe(NOT_FOUND_SENTINEL);
  });

  it("malformed slug (not a UUID) → notFound() before any DB read", async () => {
    // Auth doesn't get called because UUID validation runs first.
    let thrown: unknown;
    try {
      await TutorProfileEditPage(makeParams(NOT_A_UUID));
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toBe(NOT_FOUND_SENTINEL);
    expect(mockAuth).not.toHaveBeenCalled();
  });
});

describe("/tutor/[slug]/edit — profile state branches", () => {
  it("owner with no profile row → redirect to onboarding", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: TUTOR_UUID } });
    mockGetOwner.mockResolvedValueOnce(null);

    let thrown: unknown;
    try {
      await TutorProfileEditPage(makeParams(TUTOR_UUID));
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toBe(
      `${REDIRECT_PREFIX}/tutor/onboarding/profile`,
    );
  });

  it("owner of soft-deleted profile → null from helper → redirect to onboarding", async () => {
    // The helper returns null for both "no row" AND "soft-deleted" — the
    // page consolidates them into a single redirect. We test the redirect
    // happens regardless of the underlying reason.
    mockAuth.mockResolvedValueOnce({ user: { id: TUTOR_UUID } });
    mockGetOwner.mockResolvedValueOnce(null);

    let thrown: unknown;
    try {
      await TutorProfileEditPage(makeParams(TUTOR_UUID));
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toContain("REDIRECT");
  });

  it("owner with profile → renders ProfileForm with mode='edit' + saveAction + ownerProfileUrl", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: TUTOR_UUID } });
    mockGetOwner.mockResolvedValueOnce(APPROVED_PROFILE);

    const tree = await TutorProfileEditPage(makeParams(TUTOR_UUID));
    const props = findPropsByType(tree, profileFormSpy);
    expect(props).not.toBeNull();
    expect(props!.mode).toBe("edit");
    expect(props!.saveAction).toBe(editProfileActionMock);
    expect(props!.ownerProfileUrl).toBe(`/tutor/${TUTOR_UUID}`);
    expect(props!.initialValues).toMatchObject({
      displayName: APPROVED_PROFILE.displayName,
      bio: APPROVED_PROFILE.bio,
      city: APPROVED_PROFILE.city,
      photoR2Key: APPROVED_PROFILE.profilePhotoR2Key,
      introVideoR2Key: APPROVED_PROFILE.introVideoR2Key,
    });
  });

  it("owner of profile with is_active=false (post-edit re-vetting) still renders the form", async () => {
    // Story 2.5's core: the edit page must work when the tutor's previous
    // edit flipped is_active=false. Without the new owner helper they'd be
    // stuck — getDiscoverableTutorByUserId would have returned null.
    mockAuth.mockResolvedValueOnce({ user: { id: TUTOR_UUID } });
    mockGetOwner.mockResolvedValueOnce({
      ...APPROVED_PROFILE,
      isActive: false,
      vettingStatus: "pending",
    });

    const tree = await TutorProfileEditPage(makeParams(TUTOR_UUID));
    const props = findPropsByType(tree, profileFormSpy);
    expect(props).not.toBeNull();
    expect(props!.mode).toBe("edit");
  });
});

describe("/tutor/[slug]/edit — pre-signed URL generation", () => {
  it("passes intro video + photo R2 keys to the presign helper", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: TUTOR_UUID } });
    mockGetOwner.mockResolvedValueOnce(APPROVED_PROFILE);

    await TutorProfileEditPage(makeParams(TUTOR_UUID));

    expect(mockGetPreviewUrls).toHaveBeenCalledWith({
      introVideoR2Key: APPROVED_PROFILE.introVideoR2Key,
      photoR2Key: APPROVED_PROFILE.profilePhotoR2Key,
    });
  });
});
