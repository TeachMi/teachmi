import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REDIRECT_SENTINEL = "NEXT_REDIRECT_THROWN_IN_TEST:";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`${REDIRECT_SENTINEL}${path}`);
  },
}));

const mockRequireTutor = vi.fn<(cb?: string) => unknown>();
vi.mock("../../onboarding/_lib/require-tutor", () => ({
  requireTutor: (cb?: string) => mockRequireTutor(cb),
}));

const mockGetOwner = vi.fn<(id: string) => unknown>();
vi.mock("@/lib/db/queries/tutor-queries", () => ({
  getTutorProfileForOwner: (id: string) => mockGetOwner(id),
}));

const mockGetPreviewUrls = vi.fn<
  (input: unknown) => Promise<{
    photoUrl: string | null;
    introVideoUrl: string | null;
  }>
>(async () => ({ photoUrl: null, introVideoUrl: null }));
vi.mock("../../onboarding/profile/upload-actions", () => ({
  getTutorProfilePreviewUrls: (input: unknown) => mockGetPreviewUrls(input),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
        innerJoin: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    }),
  }),
}));

const profileTabClientSpy = vi.hoisted(() => vi.fn(() => null));
vi.mock("../_components/ProfileTabClient", () => ({
  ProfileTabClient: profileTabClientSpy,
}));

function findPropsByType(
  tree: unknown,
  type: unknown,
  seen: Set<unknown> = new Set(),
): Record<string, unknown> | null {
  if (!tree || typeof tree !== "object" || seen.has(tree)) return null;
  seen.add(tree);
  const node = tree as { type?: unknown; props?: Record<string, unknown> };
  if (node.type === type) return node.props ?? {};
  if (!node.props) return null;
  const children = node.props.children;
  if (Array.isArray(children)) {
    for (const c of children) {
      const r = findPropsByType(c, type, seen);
      if (r) return r;
    }
    return null;
  }
  if (children !== undefined) return findPropsByType(children, type, seen);
  return null;
}

import TutorMeProfilePage from "../page";

const TUTOR_UUID = "11111111-2222-3333-4444-555555555555";

const APPROVED_PROFILE = {
  userId: TUTOR_UUID,
  displayName: "ד״ר מיכל לוי",
  gender: "female" as const,
  tagline: "מורה למתמטיקה ופיזיקה",
  shortBio: "בעלת תואר ד״ר ממכון ויצמן ו־8 שנות ניסיון.",
  longBio: "שלום, אני מיכל. מלמדת מתמטיקה ופיזיקה כבר 8 שנים.",
  highlights: ["accessible", "supportive"],
  recommendationVisible: true,
  recommendationHeadline: "מומלצת במיוחד להכנה לבגרות",
  recommendationSub: "מדורגת גבוה על־ידי תלמידי תיכון",
  introVideoR2Key: `intros/${TUTOR_UUID}/v1.mp4`,
  profilePhotoR2Key: `photos/${TUTOR_UUID}/v1.png`,
  hourlyPriceIls: 180,
  lesson45PriceIls: 140,
  lesson75PriceIls: null,
  lesson90PriceIls: null,
  lessonLengthMinutes: 60,
  vettingStatus: "approved" as const,
  isActive: true,
};

beforeEach(() => {
  mockRequireTutor.mockReset();
  mockGetOwner.mockReset();
  mockGetPreviewUrls.mockClear();
  profileTabClientSpy.mockClear();
});

afterEach(() => {
  // nothing
});

describe("TutorMeProfilePage (/tutor/me Profile tab) — AC1", () => {
  it("approved tutor → mounts ProfileTabClient with initialValues", async () => {
    mockRequireTutor.mockResolvedValue({
      id: TUTOR_UUID,
      role: "tutor",
      name: "ד״ר מיכל",
      email: "ofer-tutor@teachme.co.il",
    });
    mockGetOwner.mockResolvedValue(APPROVED_PROFILE);

    const tree = await TutorMeProfilePage();
    const props = findPropsByType(tree, profileTabClientSpy);
    expect(props).not.toBeNull();
    expect(props!.initialValues).toMatchObject({
      displayName: APPROVED_PROFILE.displayName,
      tagline: APPROVED_PROFILE.tagline,
      shortBio: APPROVED_PROFILE.shortBio,
      longBio: APPROVED_PROFILE.longBio,
      highlights: APPROVED_PROFILE.highlights,
      recommendationVisible: APPROVED_PROFILE.recommendationVisible,
      recommendationHeadline: APPROVED_PROFILE.recommendationHeadline,
      recommendationSub: APPROVED_PROFILE.recommendationSub,
      photoR2Key: APPROVED_PROFILE.profilePhotoR2Key,
      introVideoR2Key: APPROVED_PROFILE.introVideoR2Key,
    });
  });

  it("tutor with no profile row → redirect to /tutor/onboarding/profile", async () => {
    mockRequireTutor.mockResolvedValue({ id: TUTOR_UUID, role: "tutor" });
    mockGetOwner.mockResolvedValue(null);

    let thrown: unknown;
    try {
      await TutorMeProfilePage();
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toBe(
      `${REDIRECT_SENTINEL}/tutor/onboarding/profile`,
    );
  });

  it("post-edit re-vetting state (is_active=false) → still renders the tab client (owner has access)", async () => {
    // Sanity guard: even though Story 2.10 dropped the gate, the owner
    // helper still resolves rows regardless of is_active state. A tutor
    // whose flag flipped via some other path (admin pause, etc.) can
    // still edit.
    mockRequireTutor.mockResolvedValue({ id: TUTOR_UUID, role: "tutor" });
    mockGetOwner.mockResolvedValue({
      ...APPROVED_PROFILE,
      isActive: false,
      vettingStatus: "pending",
    });

    const tree = await TutorMeProfilePage();
    const props = findPropsByType(tree, profileTabClientSpy);
    expect(props).not.toBeNull();
  });

  it("pre-signs R2 URLs for the existing intro_video + photo r2 keys", async () => {
    mockRequireTutor.mockResolvedValue({ id: TUTOR_UUID, role: "tutor" });
    mockGetOwner.mockResolvedValue(APPROVED_PROFILE);

    await TutorMeProfilePage();
    expect(mockGetPreviewUrls).toHaveBeenCalledWith({
      introVideoR2Key: APPROVED_PROFILE.introVideoR2Key,
      photoR2Key: APPROVED_PROFILE.profilePhotoR2Key,
    });
  });

  it("ProfileTabClient receives initialPreviews + availableSubjects (read-only-by-default contract)", async () => {
    mockRequireTutor.mockResolvedValue({ id: TUTOR_UUID, role: "tutor" });
    mockGetOwner.mockResolvedValue(APPROVED_PROFILE);

    const tree = await TutorMeProfilePage();
    const props = findPropsByType(tree, profileTabClientSpy);
    expect(props).not.toBeNull();
    expect(props!.initialPreviews).toBeDefined();
    expect(props!.availableSubjects).toBeDefined();
  });

  it("calls getTutorProfileForOwner with the session's own user id", async () => {
    mockRequireTutor.mockResolvedValue({ id: TUTOR_UUID, role: "tutor" });
    mockGetOwner.mockResolvedValue(APPROVED_PROFILE);

    await TutorMeProfilePage();
    expect(mockGetOwner).toHaveBeenCalledWith(TUTOR_UUID);
  });
});
