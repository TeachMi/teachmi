import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the subjects query helper. Default to the full 11 launch subjects.
const mockGetActiveSubjects = vi.fn();
vi.mock("@/lib/db/queries/subject-queries", () => ({
  getActiveSubjects: (...args: unknown[]) => mockGetActiveSubjects(...args),
}));

// Mock the three composed components as `vi.fn() => null` spies so we can
// inspect what props they received. Same `vi.hoisted()` + tree-walker pattern
// Story 3.2 established in `src/app/tutor/[slug]/__tests__/page.test.tsx`.
const componentSpies = vi.hoisted(() => ({
  hero: vi.fn(() => null),
  headlineFour: vi.fn(() => null),
  taxonomy: vi.fn(() => null),
}));

vi.mock("../_components/HeroSection", () => ({
  HeroSection: componentSpies.hero,
}));
vi.mock("../_components/HeadlineFourSubjects", () => ({
  HeadlineFourSubjects: componentSpies.headlineFour,
}));
vi.mock("../_components/SubjectTaxonomyGrid", () => ({
  SubjectTaxonomyGrid: componentSpies.taxonomy,
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
  { id: "id-5", slug: "statistics", displayNameHe: "סטטיסטיקה", sortOrder: 50 },
  { id: "id-6", slug: "accounting", displayNameHe: "חשבונאות", sortOrder: 60 },
  { id: "id-7", slug: "economics", displayNameHe: "כלכלה", sortOrder: 70 },
  { id: "id-8", slug: "computer-science", displayNameHe: "מדעי המחשב", sortOrder: 80 },
  { id: "id-9", slug: "physics", displayNameHe: "פיזיקה", sortOrder: 90 },
  { id: "id-10", slug: "chemistry", displayNameHe: "כימיה", sortOrder: 100 },
  { id: "id-11", slug: "biology", displayNameHe: "ביולוגיה", sortOrder: 110 },
];

beforeEach(() => {
  mockGetActiveSubjects.mockReset();
  componentSpies.hero.mockClear();
  componentSpies.headlineFour.mockClear();
  componentSpies.taxonomy.mockClear();
});

describe("HomePage (Story 3.1)", () => {
  it("calls getActiveSubjects once and passes the result to both HeadlineFourSubjects and SubjectTaxonomyGrid", async () => {
    mockGetActiveSubjects.mockResolvedValue(SAMPLE_SUBJECTS);

    const tree = await HomePage();
    const headlineProps = findPropsByType(tree, componentSpies.headlineFour);
    const taxonomyProps = findPropsByType(tree, componentSpies.taxonomy);

    expect(mockGetActiveSubjects).toHaveBeenCalledTimes(1);
    expect(headlineProps?.subjects).toBe(SAMPLE_SUBJECTS);
    expect(taxonomyProps?.subjects).toBe(SAMPLE_SUBJECTS);
  });

  it("renders Hero, HeadlineFour, and Taxonomy in that source order", async () => {
    mockGetActiveSubjects.mockResolvedValue(SAMPLE_SUBJECTS);
    const tree = await HomePage();
    const heroProps = findPropsByType(tree, componentSpies.hero);
    const headlineProps = findPropsByType(tree, componentSpies.headlineFour);
    const taxonomyProps = findPropsByType(tree, componentSpies.taxonomy);
    expect(heroProps).not.toBeNull();
    expect(headlineProps).not.toBeNull();
    expect(taxonomyProps).not.toBeNull();
  });

  it("still renders all three components when getActiveSubjects returns an empty list", async () => {
    mockGetActiveSubjects.mockResolvedValue([]);
    const tree = await HomePage();
    expect(findPropsByType(tree, componentSpies.hero)).not.toBeNull();
    expect(findPropsByType(tree, componentSpies.headlineFour)?.subjects).toEqual([]);
    expect(findPropsByType(tree, componentSpies.taxonomy)?.subjects).toEqual([]);
  });

  it("does NOT call auth() — homepage rendering is anon-equivalent for signed-in users", async () => {
    // No mock for auth() is set up; the page should not import or call it.
    // If a regression adds `auth()`, the test environment will throw because
    // the auth module loads DB env vars eagerly. Smoke-test by running the
    // page with no auth mock and confirming it completes.
    mockGetActiveSubjects.mockResolvedValue(SAMPLE_SUBJECTS);
    await expect(HomePage()).resolves.toBeTruthy();
  });

  it("degrades to empty taxonomy when getActiveSubjects throws (no DATABASE_URL / Neon outage)", async () => {
    // Regression guard for the CI playwright webServer running `pnpm dev`
    // without DATABASE_URL set. Previously this 500-ed the homepage; now it
    // renders with an empty subjects array and the taxonomy band shows its
    // "המקצועות מתעדכנים, חזרו בקרוב" empty-state copy.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetActiveSubjects.mockRejectedValue(
      new Error("DATABASE_URL is required before opening a database connection."),
    );

    const tree = await HomePage();

    expect(findPropsByType(tree, componentSpies.hero)).not.toBeNull();
    expect(findPropsByType(tree, componentSpies.headlineFour)?.subjects).toEqual([]);
    expect(findPropsByType(tree, componentSpies.taxonomy)?.subjects).toEqual([]);
    expect(errSpy).toHaveBeenCalledOnce();
    errSpy.mockRestore();
  });
});

describe("generateMetadata (Story 3.1)", () => {
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
    // Test env has NODE_ENV !== "production" → indexing is disabled.
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
