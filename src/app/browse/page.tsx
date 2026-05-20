// Marketplace browse page (Story 5.x 2026-05-19). Replaces the single-card
// stub. Renders a full-width row list of discoverable tutors with sticky
// filters, sort, pagination, and a lazy-loaded in-place BookingModal for
// the "קביעת שיעור" CTA (no extra navigation — founder direction).
//
// Layout matches `mocks/browse-v2.html`:
//   - Top nav + sticky filter bar
//   - Row cards (1-per-line on desktop, with a hover preview panel beside)
//   - Pagination at the bottom
//
// Server-Component flow:
//   1. Parse searchParams.
//   2. Resolve subject taxonomy (cached) + run the listing query in parallel.
//   3. Per-row pre-resolve R2 presigned URLs for photo + video so cards
//      render with images on first paint. Lazy presigning per-click would
//      make the hover panel show a blank rect for ~150ms — bad UX.
//   4. Hand off to the client components for any interactive behavior.
//
// We re-render fully on every navigation (`force-dynamic`) — the listing
// surface is filter-driven and the search params change often, so caching
// the page result wouldn't help. Per-tutor R2 presigns are 1h-TTL'd by
// the files provider; the page rendering them is request-bound.

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getActiveSubjects } from "@/lib/db/queries/subject-queries";
import {
  searchTutors,
  type BrowseSort,
  DEFAULT_BROWSE_PAGE_SIZE,
} from "@/lib/db/queries/browse-queries";
import { getFilesProvider } from "@/lib/providers/files";
import {
  BrowseFiltersBar,
  type SubjectOption,
} from "./_components/BrowseFiltersBar";
import {
  getPriceBucketBounds,
  parseDays,
  parseLessonLength,
  parseTimeBuckets,
} from "./_components/browse-filters-shared";
import { BrowseRow, type BrowseRowTutor } from "./_components/BrowseRow";

export const dynamic = "force-dynamic";

const PRESIGNED_URL_TTL_SEC = 3600;

interface PageProps {
  searchParams?: Promise<{
    subject?: string;
    price?: string;
    /** Lesson length minutes: "45" | "60" | "75" | "90" (or absent = "all"). */
    length?: string;
    /** CSV of 3-letter day slugs, e.g. `sun,wed`. */
    days?: string;
    /** CSV of bucket keys, e.g. `09-12,15-18`. */
    times?: string;
    sort?: string;
    page?: string;
  }>;
}

function coerceSort(raw: string | undefined): BrowseSort {
  switch (raw) {
    case "rating":
    case "price_asc":
    case "price_desc":
      return raw;
    default:
      return "recent";
  }
}

function coercePage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

async function presignFromR2(
  bucket: "tutor-intro-videos" | "tutor-profile-photos",
  key: string | null,
): Promise<string | null> {
  if (!key) return null;
  try {
    return await getFilesProvider().generatePresignedGetUrl({
      bucket,
      key,
      expiresInSec: PRESIGNED_URL_TTL_SEC,
    });
  } catch (err) {
    console.error(`[browse] presign failed (${bucket}, ${key})`, err);
    return null;
  }
}

export default async function BrowsePage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const page = coercePage(sp.page);
  const sort = coerceSort(sp.sort);
  const subjectSlug = sp.subject || undefined;
  const { min: priceMin, max: priceMax } = getPriceBucketBounds(sp.price);
  const lessonLengthMinutes = parseLessonLength(sp.length);
  const daysOfWeek = parseDays(sp.days).map((d) => d.index);
  const timeBuckets = parseTimeBuckets(sp.times).map((b) => ({
    startTime: b.startTime,
    endTime: b.endTime,
  }));

  // Fetch subjects + listing in parallel. `getActiveSubjects()` is cached
  // (per `subject-queries.ts`); the listing is per-request.
  const [subjectRows, result] = await Promise.all([
    getActiveSubjects(),
    searchTutors({
      subjectSlug,
      priceMin,
      priceMax,
      lessonLengthMinutes: lessonLengthMinutes ?? undefined,
      daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : undefined,
      timeBuckets: timeBuckets.length > 0 ? timeBuckets : undefined,
      sort,
      page,
      pageSize: DEFAULT_BROWSE_PAGE_SIZE,
    }),
  ]);

  const subjectOptions: SubjectOption[] = subjectRows.map((s) => ({
    slug: s.slug,
    displayNameHe: s.displayNameHe,
  }));

  // Pre-resolve R2 presigned URLs for every visible row. `Promise.all` is
  // fine here — the listing is capped at 12 rows × 2 presigns = 24 calls,
  // all hitting AWS SigV4 signing locally (no network round-trip).
  const enrichedRows = await Promise.all(
    result.tutors.map(async (t) => {
      const [profilePhotoUrl, introVideoUrl] = await Promise.all([
        presignFromR2("tutor-profile-photos", t.profilePhotoR2Key),
        presignFromR2("tutor-intro-videos", t.introVideoR2Key),
      ]);
      const rowTutor: BrowseRowTutor = {
        userId: t.userId,
        displayName: t.displayName,
        gender: t.gender,
        tagline: t.tagline,
        shortBio: t.shortBio,
        highlights: t.highlights,
        lesson45PriceIls: t.lesson45PriceIls,
        hourlyPriceIls: t.hourlyPriceIls,
        lesson75PriceIls: t.lesson75PriceIls,
        lesson90PriceIls: t.lesson90PriceIls,
        averageRating: t.averageRating,
        ratingCount: t.ratingCount,
        totalLessonsCompleted: t.totalLessonsCompleted,
      };
      return { tutor: rowTutor, profilePhotoUrl, introVideoUrl };
    }),
  );

  return (
    <AppShell activeHref="/browse" mainClassName="flex-1 bg-surface">
      <BrowseFiltersBar subjects={subjectOptions} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <header className="text-start mb-6">
          <h1 className="font-display font-bold text-2xl text-primary-container">
            {subjectSlug ? `מורים ל${subjectLabel(subjectOptions, subjectSlug)}` : "כל המורים"}
          </h1>
          {result.totalCount === 0 && (
            <p className="text-sm text-secondary mt-1">
              אין תוצאות תואמות לסינון הנוכחי
            </p>
          )}
        </header>

        {result.tutors.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {enrichedRows.map(({ tutor, profilePhotoUrl, introVideoUrl }) => (
              <BrowseRow
                key={tutor.userId}
                tutor={tutor}
                profilePhotoUrl={profilePhotoUrl}
                introVideoUrl={introVideoUrl}
                selectedLengthMinutes={lessonLengthMinutes}
              />
            ))}
          </div>
        )}

        {result.totalPages > 1 && (
          <Pagination
            currentPage={result.page}
            totalPages={result.totalPages}
            searchParams={sp}
          />
        )}
      </main>
    </AppShell>
  );
}

function subjectLabel(options: SubjectOption[], slug: string): string {
  return options.find((o) => o.slug === slug)?.displayNameHe ?? "המקצוע";
}

function EmptyState() {
  return (
    <div className="bg-linen border border-linen-border rounded-xl p-8 text-center">
      <span
        className="material-symbols-outlined text-tertiary-accent text-5xl mb-3 inline-block"
        aria-hidden="true"
      >
        search_off
      </span>
      <h3 className="font-display font-bold text-primary-container text-xl mb-2">
        לא מצאנו? עדכנו את הסינון
      </h3>
      <p className="text-secondary text-sm mb-4">
        ננסו להרחיב את טווח המחיר, להחליף מקצוע, או לאפס את הסינון.
      </p>
      <Link
        href="/browse"
        className="inline-block bg-primary-container text-on-primary px-6 py-2 rounded-lg font-bold text-sm hover:bg-primary transition-colors"
      >
        איפוס סינון
      </Link>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}) {
  const baseQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "page" || !v) continue;
    baseQuery.set(k, v);
  }
  const hrefFor = (page: number) => {
    const q = new URLSearchParams(baseQuery);
    if (page > 1) q.set("page", String(page));
    const s = q.toString();
    return s ? `/browse?${s}` : "/browse";
  };

  // Window of page links: always show 1, current ± 1, last. Ellipsis fills gaps.
  // For ≤8 pages just render them all linearly.
  const pages: Array<number | "…"> = [];
  if (totalPages <= 8) {
    for (let p = 1; p <= totalPages; p++) pages.push(p);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("…");
    for (
      let p = Math.max(2, currentPage - 1);
      p <= Math.min(totalPages - 1, currentPage + 1);
      p++
    ) {
      pages.push(p);
    }
    if (currentPage < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <nav
      aria-label="עמודי תוצאות"
      className="mt-10 flex justify-center items-center gap-2"
    >
      {currentPage > 1 && (
        <Link
          href={hrefFor(currentPage - 1)}
          className="w-10 h-10 rounded-lg bg-white border border-linen-border text-primary-container hover:border-primary-fixed-dim flex items-center justify-center"
          aria-label="הקודם"
        >
          <span className="material-symbols-outlined text-base">chevron_right</span>
        </Link>
      )}
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="text-secondary px-2">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={hrefFor(p)}
            aria-current={p === currentPage ? "page" : undefined}
            className={
              p === currentPage
                ? "w-10 h-10 rounded-lg bg-primary-container text-on-primary font-bold text-sm flex items-center justify-center"
                : "w-10 h-10 rounded-lg bg-white border border-linen-border text-primary-container font-bold text-sm hover:border-primary-fixed-dim flex items-center justify-center"
            }
          >
            {p}
          </Link>
        ),
      )}
      {currentPage < totalPages && (
        <Link
          href={hrefFor(currentPage + 1)}
          className="w-10 h-10 rounded-lg bg-white border border-linen-border text-primary-container hover:border-primary-fixed-dim flex items-center justify-center"
          aria-label="הבא"
        >
          <span className="material-symbols-outlined text-base">chevron_left</span>
        </Link>
      )}
    </nav>
  );
}
