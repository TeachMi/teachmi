import { describe, expect, it, vi, beforeEach } from "vitest";

// `notFound()` from next/navigation throws a Next.js-internal error to halt
// rendering. Mock it to throw a recognizable sentinel we can assert against.
const NOT_FOUND_SENTINEL = "NEXT_NOT_FOUND_THROWN_IN_TEST";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND_SENTINEL);
  },
}));

// Mocks for the four query helpers + the discoverable lookup. Defaults reset
// before each test.
const mockGetDiscoverable = vi.fn();
const mockGetSubjects = vi.fn();
const mockGetAvailability = vi.fn();
const mockGetBookings = vi.fn();
const mockGetRating = vi.fn();

vi.mock("@/lib/db/queries/tutor-queries", () => ({
  getDiscoverableTutorByUserId: (...args: unknown[]) => mockGetDiscoverable(...args),
  getTutorSubjects: (...args: unknown[]) => mockGetSubjects(...args),
  getTutorAvailabilityRows: (...args: unknown[]) => mockGetAvailability(...args),
  getActiveBookingsForTutor: (...args: unknown[]) => mockGetBookings(...args),
  getTutorRatingHistogram: (...args: unknown[]) => mockGetRating(...args),
}));

// Mock FilesProvider — server-rendered presigned URLs.
const mockPresignedGet = vi.fn();
vi.mock("@/lib/providers/files", () => ({
  getFilesProvider: () => ({
    generatePresignedGetUrl: (input: unknown) => mockPresignedGet(input),
    generatePresignedPutUrl: vi.fn(),
    deleteObject: vi.fn(),
  }),
}));

// Mock compute-slots — the page calls computeSlotStates + startOfTodayJerusalem.
// We don't need real date math in the page test; the algorithm is tested
// separately in `src/lib/availability/__tests__/compute-slots.test.ts`.
vi.mock("@/lib/availability/compute-slots", () => ({
  computeSlotStates: () => new Map(),
  startOfTodayJerusalem: () => new Date("2026-05-14T00:00:00.000Z"),
}));

// Mock _components as vi.fn() spies. Use `vi.hoisted()` so the spy refs are
// defined BEFORE the vi.mock factories run (which are themselves hoisted to
// the top of the file by vitest's transformer).
const componentSpies = vi.hoisted(() => ({
  hero: vi.fn(() => null),
  bookingSidebar: vi.fn(() => null),
  rating: vi.fn(() => null),
  subjects: vi.fn(() => null),
}));

vi.mock("../_components/Hero", () => ({ Hero: componentSpies.hero }));
vi.mock("../_components/BookingSidebar", () => ({
  BookingSidebar: componentSpies.bookingSidebar,
}));
vi.mock("../_components/RatingWidget", () => ({
  RatingWidget: componentSpies.rating,
}));
vi.mock("../_components/SubjectChips", () => ({
  SubjectChips: componentSpies.subjects,
}));

// React components are referenced as element types in the JSX tree; their
// function body isn't invoked at test time (no renderer). Walk the tree to
// find the element whose `type === spy` and return its props.
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
function lastPropsTo(spy: typeof componentSpies.hero): Record<string, unknown> | null {
  // Backward-compat shim: walk via a global last-rendered tree stash.
  return findPropsByType(lastRendered, spy);
}
let lastRendered: unknown = null;

// Mock auth — anon by default, signed-in tests override.
const mockAuth = vi.fn();
vi.mock("@/lib/auth/auth", () => ({
  auth: () => mockAuth(),
}));

// Mock AppShell — passes through children only.
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));

// Import AFTER mocks so the page picks up the mocked modules.
const { default: PublicTutorProfilePage, generateMetadata } = await import("../page");

const TUTOR_UUID = "11111111-2222-3333-4444-555555555555";
const NOT_A_UUID = "ד״ר מיכל לוי"; // also Hebrew; should fail UUID parse twice over

const FULL_TUTOR = {
  userId: TUTOR_UUID,
  displayName: "ד״ר מיכל לוי",
  gender: "female",
  bio: "מורה למתמטיקה עם 8 שנות ניסיון.",
  city: "תל אביב",
  introVideoR2Key: `intros/${TUTOR_UUID}/abc.mp4`,
  profilePhotoR2Key: `photos/${TUTOR_UUID}/abc.jpg`,
  hourlyPriceIls: 180,
  lesson45PriceIls: 140,
  lesson75PriceIls: null,
  lesson90PriceIls: null,
  lessonLengthMinutes: 60,
  averageRating: "4.90",
  ratingCount: 124,
  totalLessonsCompleted: 1240,
};

beforeEach(() => {
  mockGetDiscoverable.mockReset();
  mockGetSubjects.mockReset().mockResolvedValue([]);
  mockGetAvailability.mockReset().mockResolvedValue([]);
  mockGetBookings.mockReset().mockResolvedValue([]);
  mockGetRating.mockReset().mockResolvedValue(null);
  mockPresignedGet.mockReset().mockImplementation(async (input: { key: string }) =>
    `https://stub.r2.local/${input.key}?sig=fake`,
  );
  mockAuth.mockReset().mockResolvedValue(null);
  componentSpies.hero.mockClear();
  componentSpies.bookingSidebar.mockClear();
  componentSpies.rating.mockClear();
  componentSpies.subjects.mockClear();
});

describe("/tutor/[slug] page — gate behavior", () => {
  it("calls notFound() when helper returns null (tutor not discoverable)", async () => {
    mockGetDiscoverable.mockResolvedValue(null);

    await expect(
      PublicTutorProfilePage({
        params: Promise.resolve({ slug: TUTOR_UUID }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(NOT_FOUND_SENTINEL);

    expect(mockGetDiscoverable).toHaveBeenCalledWith(TUTOR_UUID);
  });

  it("calls notFound() WITHOUT querying the DB when slug fails UUID parse", async () => {
    await expect(
      PublicTutorProfilePage({
        params: Promise.resolve({ slug: NOT_A_UUID }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(NOT_FOUND_SENTINEL);

    expect(mockGetDiscoverable).not.toHaveBeenCalled();
  });

  it("calls notFound() WITHOUT querying the DB on empty slug", async () => {
    await expect(
      PublicTutorProfilePage({
        params: Promise.resolve({ slug: "" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(NOT_FOUND_SENTINEL);
    expect(mockGetDiscoverable).not.toHaveBeenCalled();
  });

  it("calls notFound() on a transient DB failure (degrades to 404, not 500)", async () => {
    mockGetDiscoverable.mockRejectedValue(new Error("transient neon outage"));

    await expect(
      PublicTutorProfilePage({
        params: Promise.resolve({ slug: TUTOR_UUID }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(NOT_FOUND_SENTINEL);
  });
});

describe("/tutor/[slug] page — rendered profile (Story 3.2)", () => {
  it("passes tutor + presigned URLs into the Hero component", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    const heroProps = lastPropsTo(componentSpies.hero) as {
      tutor: { displayName: string; bio: string };
      introVideoUrl: string;
      profilePhotoUrl: string;
    };
    expect(heroProps).not.toBeNull();
    expect(heroProps.tutor.displayName).toBe("ד״ר מיכל לוי");
    expect(heroProps.tutor.bio).toContain("מורה למתמטיקה");
    expect(heroProps.introVideoUrl).toContain("stub.r2.local");
    expect(heroProps.profilePhotoUrl).toContain("stub.r2.local");
  });

  it("calls presigned-GET for both intro video and profile photo buckets", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    const bucketCalls = mockPresignedGet.mock.calls.map((args) => args[0]);
    expect(bucketCalls).toContainEqual(
      expect.objectContaining({ bucket: "tutor-intro-videos" }),
    );
    expect(bucketCalls).toContainEqual(
      expect.objectContaining({ bucket: "tutor-profile-photos" }),
    );
  });

  it("passes empty slotStates to BookingSidebar when tutor has no rows", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);
    mockGetAvailability.mockResolvedValue([]);

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    const sidebarProps = lastPropsTo(componentSpies.bookingSidebar) as {
      slotStates: Map<unknown, unknown>;
      hasAnyAvailability: boolean;
    };
    expect(sidebarProps).not.toBeNull();
    expect(sidebarProps.slotStates).toBeInstanceOf(Map);
    expect(sidebarProps.hasAnyAvailability).toBe(false);
  });

  it("does NOT render RatingWidget when histogram is null", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);
    mockGetRating.mockResolvedValue(null);

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    expect(lastPropsTo(componentSpies.rating)).toBeNull();
  });

  it("does NOT render RatingWidget when histogram has zero reviews (closed-beta guard)", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);
    mockGetRating.mockResolvedValue({
      score1: 0,
      score2: 0,
      score3: 0,
      score4: 0,
      score5: 0,
      total: 0,
      average: 0,
    });

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    expect(lastPropsTo(componentSpies.rating)).toBeNull();
  });

  it("renders RatingWidget with the histogram when total > 0", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);
    const histogram = {
      score1: 0,
      score2: 0,
      score3: 3,
      score4: 12,
      score5: 109,
      total: 124,
      average: 4.85,
    };
    mockGetRating.mockResolvedValue(histogram);

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    const ratingProps = lastPropsTo(componentSpies.rating) as { histogram: typeof histogram };
    expect(ratingProps?.histogram).toEqual(histogram);
  });

  it("passes subjects to SubjectChips component", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);
    const subjects = [
      {
        id: "s-1",
        slug: "mathematics",
        displayNameHe: "מתמטיקה",
        sortOrder: 1,
        proficiencyNote: "5 יחידות",
      },
    ];
    mockGetSubjects.mockResolvedValue(subjects);

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    const subjProps = lastPropsTo(componentSpies.subjects) as { subjects: typeof subjects };
    expect(subjProps?.subjects).toEqual(subjects);
  });

  it("passes the tutor's bio (bidi-stripped) to <Hero> so it renders under the name", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    // 2026-05-16 amendment: the bio moved out of a standalone "About"
    // section in page.tsx and into the Hero component's right column. The
    // page no longer renders the bio inline — it threads `tutor.bio` (with
    // bidi-override chars stripped) through to <Hero> via props.
    const heroProps = lastPropsTo(componentSpies.hero) as { tutor: { bio: string | null } };
    expect(heroProps?.tutor?.bio).toBe(FULL_TUTOR.bio);
  });

  it("defaults initialDuration to 60 on BookingSidebar when ?duration= is absent", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    const sidebarProps = lastPropsTo(componentSpies.bookingSidebar) as {
      initialDuration: 45 | 60 | 75 | 90;
    };
    expect(sidebarProps?.initialDuration).toBe(60);
  });

  it("threads ?duration=45 from URL into BookingSidebar.initialDuration", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({ duration: "45" }),
    });

    const sidebarProps = lastPropsTo(componentSpies.bookingSidebar) as {
      initialDuration: 45 | 60 | 75 | 90;
    };
    expect(sidebarProps?.initialDuration).toBe(45);
  });

  it("passes isSignedIn=false to BookingSidebar when auth returns null", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);
    mockAuth.mockResolvedValue(null);

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    const sidebarProps = lastPropsTo(componentSpies.bookingSidebar) as {
      isSignedIn: boolean;
    };
    expect(sidebarProps?.isSignedIn).toBe(false);
  });

  it("passes isSignedIn=true to BookingSidebar when auth returns a session", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);
    mockAuth.mockResolvedValue({ user: { id: "u-1" } });

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    const sidebarProps = lastPropsTo(componentSpies.bookingSidebar) as {
      isSignedIn: boolean;
    };
    expect(sidebarProps?.isSignedIn).toBe(true);
  });

  it("passes the four-length prices map (with nulls for un-offered lengths) to BookingSidebar", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);

    lastRendered = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    const sidebarProps = lastPropsTo(componentSpies.bookingSidebar) as {
      prices: Record<45 | 60 | 75 | 90, number | null>;
    };
    expect(sidebarProps?.prices).toEqual({
      45: 140,
      60: 180,
      75: null,
      90: null,
    });
  });
});

describe("/tutor/[slug] page — generateMetadata (Story 3.2 extensions)", () => {
  it("returns a personalized title + description + OG when tutor is discoverable", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    expect(meta.title).toBe("ד״ר מיכל לוי · TeachMe");
    expect(meta.description).toBe("מורה למתמטיקה עם 8 שנות ניסיון.");
    const og = meta.openGraph as Record<string, unknown> | undefined;
    expect(og?.title).toBe("ד״ר מיכל לוי · TeachMe");
    expect(og?.type).toBe("profile");
    expect(og?.locale).toBe("he_IL");
    expect(og?.images).toBeDefined();
  });

  it("uses the og-default-tutor.png fallback when tutor has no photo", async () => {
    mockGetDiscoverable.mockResolvedValue({
      ...FULL_TUTOR,
      profilePhotoR2Key: null,
    });

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    const images = meta.openGraph?.images as Array<{ url: string }> | undefined;
    expect(images?.[0]?.url).toBe("/og-default-tutor.png");
  });

  it("uses the /api/og/tutor/[id]/photo proxy URL when tutor HAS a photo (no signed-URL leak in OG meta)", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    const images = meta.openGraph?.images as Array<{ url: string }> | undefined;
    expect(images?.[0]?.url).toBe(`/api/og/tutor/${TUTOR_UUID}/photo`);
    // Specifically MUST NOT contain a signed presigned URL.
    expect(images?.[0]?.url).not.toContain("stub.r2.local");
    expect(images?.[0]?.url).not.toContain("sig=");
  });

  it("emits noindex by default — only indexes in production with ALLOW_PUBLIC_INDEX=true", async () => {
    mockGetDiscoverable.mockResolvedValue(FULL_TUTOR);

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    // Test env has NODE_ENV !== "production" → indexing is disabled.
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("returns a generic title when tutor is not discoverable (no name leak)", async () => {
    mockGetDiscoverable.mockResolvedValue(null);

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    expect(meta.title).toBe("TeachMe");
    expect(meta.openGraph).toBeUndefined();
  });

  it("returns a generic title for malformed UUID slugs", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: NOT_A_UUID }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toBe("TeachMe");
    expect(mockGetDiscoverable).not.toHaveBeenCalled();
  });

  it("truncates long bios at 160 chars in the description (with ellipsis)", async () => {
    const longBio = "א".repeat(300); // 300 Hebrew chars
    mockGetDiscoverable.mockResolvedValue({ ...FULL_TUTOR, bio: longBio });

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    expect((meta.description as string).length).toBeLessThanOrEqual(160);
    expect(meta.description).toMatch(/…$/);
  });

  it("falls back to a generic description when bio is null", async () => {
    mockGetDiscoverable.mockResolvedValue({ ...FULL_TUTOR, bio: null });

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: TUTOR_UUID }),
      searchParams: Promise.resolve({}),
    });

    expect(meta.description).toBe("ד״ר מיכל לוי — מורה ב-TeachMe");
  });
});
