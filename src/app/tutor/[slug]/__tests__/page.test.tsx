import { describe, expect, it, vi, beforeEach } from "vitest";

// `notFound()` from next/navigation throws a Next.js-internal error to halt
// rendering. Mock it to throw a recognizable sentinel we can assert against.
const NOT_FOUND_SENTINEL = "NEXT_NOT_FOUND_THROWN_IN_TEST";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND_SENTINEL);
  },
}));

// Mock the query helper to control what the page sees without a real DB.
const mockGet = vi.fn();
vi.mock("@/lib/db/queries/tutor-queries", () => ({
  getDiscoverableTutorByUserId: (...args: unknown[]) => mockGet(...args),
}));

// Mock the AppShell — we don't need to render it; we just want to assert the
// page composes correctly.
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));

// Import AFTER mocks so the page picks up the mocked modules.
const { default: PublicTutorProfilePage, generateMetadata } = await import("../page");

const TUTOR_UUID = "11111111-2222-3333-4444-555555555555";
const NOT_A_UUID = "ד״ר מיכל לוי"; // also Hebrew; should fail UUID parse twice over

beforeEach(() => {
  mockGet.mockReset();
});

describe("/tutor/[slug] page — gate behavior", () => {
  it("calls notFound() when helper returns null (tutor not discoverable)", async () => {
    mockGet.mockResolvedValue(null);

    await expect(
      PublicTutorProfilePage({ params: Promise.resolve({ slug: TUTOR_UUID }) }),
    ).rejects.toThrow(NOT_FOUND_SENTINEL);

    expect(mockGet).toHaveBeenCalledWith(TUTOR_UUID);
  });

  it("calls notFound() WITHOUT querying the DB when slug fails UUID parse", async () => {
    await expect(
      PublicTutorProfilePage({ params: Promise.resolve({ slug: NOT_A_UUID }) }),
    ).rejects.toThrow(NOT_FOUND_SENTINEL);

    // The helper must NOT be called for malformed UUIDs — Postgres' uuid cast
    // would 500 the request. Pre-validating in the route is the guard.
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("calls notFound() WITHOUT querying the DB on empty slug", async () => {
    await expect(
      PublicTutorProfilePage({ params: Promise.resolve({ slug: "" }) }),
    ).rejects.toThrow(NOT_FOUND_SENTINEL);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("calls notFound() on a transient DB failure (degrades to 404, not 500)", async () => {
    mockGet.mockRejectedValue(new Error("transient neon outage"));

    await expect(
      PublicTutorProfilePage({ params: Promise.resolve({ slug: TUTOR_UUID }) }),
    ).rejects.toThrow(NOT_FOUND_SENTINEL);
  });

  it("renders the displayName when helper returns a discoverable tutor row", async () => {
    mockGet.mockResolvedValue({
      userId: TUTOR_UUID,
      displayName: "ד״ר מיכל לוי",
      bio: null,
      city: null,
      introVideoR2Key: null,
      profilePhotoR2Key: null,
      hourlyPriceIls: 180,
      lesson45PriceIls: 140,
      lessonLengthMinutes: 60,
      averageRating: null,
      ratingCount: 0,
      totalLessonsCompleted: 0,
    });

    const result = await PublicTutorProfilePage({
      params: Promise.resolve({ slug: TUTOR_UUID }),
    });

    // The page returns a React element tree. Walk it to find the rendered
    // displayName string — no jsdom needed, just inspect the JSX structure.
    const json = JSON.stringify(result);
    expect(json).toContain("ד״ר מיכל לוי");
    expect(json).toContain("פרופיל המורה — בקרוב");
  });
});

describe("/tutor/[slug] page — generateMetadata", () => {
  it("returns a personalized title when tutor is discoverable", async () => {
    mockGet.mockResolvedValue({
      userId: TUTOR_UUID,
      displayName: "ד״ר מיכל לוי",
      bio: null,
      city: null,
      introVideoR2Key: null,
      profilePhotoR2Key: null,
      hourlyPriceIls: 180,
      lesson45PriceIls: 140,
      lessonLengthMinutes: 60,
      averageRating: null,
      ratingCount: 0,
      totalLessonsCompleted: 0,
    });

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: TUTOR_UUID }),
    });

    expect(meta.title).toBe("ד״ר מיכל לוי · TeachMe");
  });

  it("returns a generic title when tutor is not discoverable (no name leak)", async () => {
    mockGet.mockResolvedValue(null);

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: TUTOR_UUID }),
    });

    expect(meta.title).toBe("TeachMe");
  });

  it("returns a generic title for malformed UUID slugs", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: NOT_A_UUID }),
    });
    expect(meta.title).toBe("TeachMe");
    expect(mockGet).not.toHaveBeenCalled();
  });
});
