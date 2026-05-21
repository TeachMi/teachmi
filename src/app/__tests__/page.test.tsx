import { describe, expect, it, vi, beforeEach } from "vitest";

// Marketplace homepage test. Rebuilt for the landing-v2 structure
// (2026-05-20): hero + subject grid + how-it-works + featured tutors +
// trust strip + FAQ + tutor-recruiting band.

// --- Module mocks --------------------------------------------------------

const mockGetActiveSubjects = vi.fn();
vi.mock("@/lib/db/queries/subject-queries", () => ({
  getActiveSubjects: (...args: unknown[]) => mockGetActiveSubjects(...args),
}));

const mockGetFeaturedTutors = vi.fn();
vi.mock("@/lib/db/queries/browse-queries", () => ({
  getFeaturedTutors: (...args: unknown[]) => mockGetFeaturedTutors(...args),
}));

const mockGeneratePresignedGetUrl = vi.fn();
vi.mock("@/lib/providers/files", () => ({
  getFilesProvider: () => ({
    generatePresignedGetUrl: (...args: unknown[]) =>
      mockGeneratePresignedGetUrl(...args),
  }),
  isStubUrl: (url: string | null | undefined) =>
    typeof url === "string" && url.startsWith("stub:"),
}));

// Section components mocked as null-rendering spies so the test can inspect
// the props the page hands each one. Same `vi.hoisted()` + tree-walker
// pattern Story 3.1/3.2 established.
const componentSpies = vi.hoisted(() => ({
  hero: vi.fn(() => null),
  subjectGrid: vi.fn(() => null),
  howItWorks: vi.fn(() => null),
  featuredTutors: vi.fn(() => null),
  trustStrip: vi.fn(() => null),
  faq: vi.fn(() => null),
  tutorBand: vi.fn(() => null),
}));

vi.mock("../_components/HeroSection", () => ({
  HeroSection: componentSpies.hero,
}));
vi.mock("../_components/SubjectGrid", () => ({
  SubjectGrid: componentSpies.subjectGrid,
}));
vi.mock("../_components/HowItWorks", () => ({
  HowItWorks: componentSpies.howItWorks,
}));
vi.mock("../_components/FeaturedTutors", () => ({
  FeaturedTutors: componentSpies.featuredTutors,
}));
vi.mock("../_components/TrustStrip", () => ({
  TrustStrip: componentSpies.trustStrip,
}));
vi.mock("../_components/HomeFaq", () => ({
  HomeFaq: componentSpies.faq,
}));
vi.mock("../_components/TutorRecruitingBand", () => ({
  TutorRecruitingBand: componentSpies.tutorBand,
}));

// Mock AppShell — passes through children only.
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));

// Import AFTER mocks so the page picks up the mocked modules.
const { default: HomePage, generateMetadata } = await import("../page");

// Walks the React element tree (without invoking spy bodies) to find the
// element with `type === target` and returns its props.
function findPropsByType(
  tree: unknown,
  target: unknown,
): Record<string, unknown> | null {
  if (!tree || typeof tree !== "object") return null;
  const node = tree as { type?: unknown; props?: Record<string, unknown> };
  if (node.type === target) return node.props ?? {};
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findPropsByType(child, target);
      if (found) return found;
    }
    return null;
  }
  if (children !== undefined) return findPropsByType(children, target);
  return null;
}

const SAMPLE_SUBJECTS = [
  { id: "id-1", slug: "mathematics", displayNameHe: "מתמטיקה", sortOrder: 10 },
  { id: "id-2", slug: "english", displayNameHe: "אנגלית", sortOrder: 20 },
  { id: "id-3", slug: "hebrew-lashon", displayNameHe: "עברית ולשון", sortOrder: 30 },
  { id: "id-4", slug: "psychometric", displayNameHe: "פסיכומטרי", sortOrder: 40 },
];

// Minimal `BrowseTutorCard`-shaped rows — the page only reads
// `profilePhotoR2Key` and threads the whole object through.
const SAMPLE_FEATURED = [
  { userId: "tutor-1", displayName: "שירה כהן", profilePhotoR2Key: "mock/photo-1.jpg" },
  { userId: "tutor-2", displayName: "דניאל מרגלית", profilePhotoR2Key: null },
];

beforeEach(() => {
  mockGetActiveSubjects.mockReset();
  mockGetFeaturedTutors.mockReset();
  mockGeneratePresignedGetUrl.mockReset();
  for (const spy of Object.values(componentSpies)) spy.mockClear();
  // Sensible defaults — individual tests override as needed.
  mockGetActiveSubjects.mockResolvedValue(SAMPLE_SUBJECTS);
  mockGetFeaturedTutors.mockResolvedValue([]);
  mockGeneratePresignedGetUrl.mockResolvedValue("https://r2.example/photo.jpg");
});

describe("HomePage — landing-v2 structure", () => {
  it("calls getActiveSubjects once and passes the result to HeroSection + SubjectGrid", async () => {
    const tree = await HomePage();
    expect(mockGetActiveSubjects).toHaveBeenCalledTimes(1);
    expect(findPropsByType(tree, componentSpies.hero)?.subjects).toBe(
      SAMPLE_SUBJECTS,
    );
    expect(findPropsByType(tree, componentSpies.subjectGrid)?.subjects).toBe(
      SAMPLE_SUBJECTS,
    );
  });

  it("renders all seven landing-v2 sections", async () => {
    const tree = await HomePage();
    for (const spy of Object.values(componentSpies)) {
      expect(findPropsByType(tree, spy)).not.toBeNull();
    }
  });

  it("still renders when getActiveSubjects returns an empty list", async () => {
    mockGetActiveSubjects.mockResolvedValue([]);
    const tree = await HomePage();
    expect(findPropsByType(tree, componentSpies.hero)?.subjects).toEqual([]);
    expect(findPropsByType(tree, componentSpies.subjectGrid)?.subjects).toEqual(
      [],
    );
  });

  it("degrades to an empty taxonomy when getActiveSubjects throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetActiveSubjects.mockRejectedValue(
      new Error("DATABASE_URL is required before opening a database connection."),
    );

    const tree = await HomePage();

    expect(findPropsByType(tree, componentSpies.hero)?.subjects).toEqual([]);
    expect(findPropsByType(tree, componentSpies.subjectGrid)?.subjects).toEqual(
      [],
    );
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("passes featured tutors to FeaturedTutors, presigning photos and respecting null R2 keys", async () => {
    mockGetFeaturedTutors.mockResolvedValue(SAMPLE_FEATURED);

    const tree = await HomePage();
    const featured = findPropsByType(tree, componentSpies.featuredTutors)
      ?.tutors as Array<{ tutor: { userId: string }; profilePhotoUrl: string | null }>;

    expect(featured).toHaveLength(2);
    expect(featured[0]?.profilePhotoUrl).toBe("https://r2.example/photo.jpg");
    // The second tutor has no R2 key — no presign attempt, null URL.
    expect(featured[1]?.profilePhotoUrl).toBeNull();
    expect(mockGeneratePresignedGetUrl).toHaveBeenCalledTimes(1);
  });

  it("keeps the featured band when a photo presign fails — per-photo degrade", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetFeaturedTutors.mockResolvedValue(SAMPLE_FEATURED);
    mockGeneratePresignedGetUrl.mockRejectedValue(new Error("R2 unreachable"));

    const tree = await HomePage();
    const featured = findPropsByType(tree, componentSpies.featuredTutors)
      ?.tutors as Array<{ profilePhotoUrl: string | null }>;

    // The band still renders both tutors; an unreachable photo just
    // degrades to a null URL (the initial-letter fallback).
    expect(featured).toHaveLength(2);
    expect(featured.every((e) => e.profilePhotoUrl === null)).toBe(true);
    errSpy.mockRestore();
  });

  it("omits featured tutors (empty list) when getFeaturedTutors throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetFeaturedTutors.mockRejectedValue(new Error("Neon outage"));

    const tree = await HomePage();

    expect(findPropsByType(tree, componentSpies.featuredTutors)?.tutors).toEqual(
      [],
    );
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("does NOT call auth() — the homepage renders identically for signed-in and anonymous visitors", async () => {
    // No auth mock is set up; if a regression adds `auth()` the test
    // environment throws because the auth module loads DB env vars eagerly.
    await expect(HomePage()).resolves.toBeTruthy();
  });
});

describe("generateMetadata", () => {
  it("returns the locked TeachMe title + Hebrew description", async () => {
    const meta = await generateMetadata();
    expect(meta.title).toBe("TeachMe — מורים פרטיים בעברית");
    expect(meta.description).toContain("פלטפורמת מורים פרטיים");
  });

  it("openGraph references /og-default-home.png with 1200x630 dimensions", async () => {
    const meta = await generateMetadata();
    const images = meta.openGraph?.images as Array<{
      url: string;
      width: number;
      height: number;
    }> | undefined;
    expect(images?.[0]?.url).toBe("/og-default-home.png");
    expect(images?.[0]?.width).toBe(1200);
    expect(images?.[0]?.height).toBe(630);
  });

  it("openGraph.type is 'website' (not 'profile' — that's the tutor page)", async () => {
    const meta = await generateMetadata();
    const og = meta.openGraph as { type?: string; locale?: string } | undefined;
    expect(og?.type).toBe("website");
    expect(og?.locale).toBe("he_IL");
  });

  it("twitter card is summary_large_image", async () => {
    const meta = await generateMetadata();
    const twitter = meta.twitter as { card?: string } | undefined;
    expect(twitter?.card).toBe("summary_large_image");
  });

  it("emits noindex by default — only indexes in production with ALLOW_PUBLIC_INDEX=true", async () => {
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
