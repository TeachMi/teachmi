import Link from "next/link";
import { formatIlsCurrency } from "@/lib/hebrew/format";
import type { BrowseTutorCard } from "@/lib/db/queries/browse-queries";

// Marketplace homepage "featured tutors" band — browse-style rows from
// `landing-v2.html`. Data comes from `getFeaturedTutors()` (the
// `tutor_profiles.is_featured` flag). Each row is a plain link to the
// public profile — NOT the interactive in-place BookingModal that
// `/browse` rows carry, which keeps this section a pure RSC. RSC; zero
// client JS.

export interface FeaturedTutorEntry {
  tutor: BrowseTutorCard;
  /** Presigned R2 URL for the photo, or null → initial-letter fallback. */
  profilePhotoUrl: string | null;
}

interface FeaturedTutorsProps {
  tutors: FeaturedTutorEntry[];
}

// Headline price for the card: the 60-min anchor when offered, else the
// shortest offered length. Null when the tutor priced nothing.
function pickHeadlinePrice(
  tutor: BrowseTutorCard,
): { priceIls: number; minutes: number } | null {
  if (tutor.hourlyPriceIls !== null)
    return { priceIls: tutor.hourlyPriceIls, minutes: 60 };
  if (tutor.lesson45PriceIls !== null)
    return { priceIls: tutor.lesson45PriceIls, minutes: 45 };
  if (tutor.lesson75PriceIls !== null)
    return { priceIls: tutor.lesson75PriceIls, minutes: 75 };
  if (tutor.lesson90PriceIls !== null)
    return { priceIls: tutor.lesson90PriceIls, minutes: 90 };
  return null;
}

export function FeaturedTutors({ tutors }: FeaturedTutorsProps) {
  // No featured tutors (none flagged, or the query degraded to empty) —
  // the homepage simply omits the band rather than rendering a hollow
  // section.
  if (tutors.length === 0) return null;

  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-5xl px-6 py-14 text-start">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl font-extrabold text-primary-container">
            מורים מובילים
          </h2>
          <Link
            href="/browse"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary-container hover:underline"
          >
            לכל המורים
            <span
              className="material-symbols-outlined text-base"
              aria-hidden="true"
            >
              arrow_back
            </span>
          </Link>
        </div>

        <div className="space-y-4">
          {tutors.map(({ tutor, profilePhotoUrl }) => {
            const price = pickHeadlinePrice(tutor);
            const rating =
              tutor.ratingCount > 0 &&
              tutor.averageRating !== null &&
              Number.isFinite(Number(tutor.averageRating))
                ? Number(tutor.averageRating)
                : null;
            return (
              <Link
                key={tutor.userId}
                href={`/tutor/${tutor.userId}`}
                className="block rounded-2xl border border-linen-border bg-white p-5 transition-all hover:border-primary-fixed-dim hover:shadow-lg"
              >
                <div className="grid grid-cols-1 gap-5 md:grid-cols-[140px_1fr_auto]">
                  {/* Photo — square rounded-xl per the locked avatar rule. */}
                  <div className="shrink-0">
                    {profilePhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profilePhotoUrl}
                        alt={tutor.displayName}
                        width={144}
                        height={144}
                        className="h-36 w-36 rounded-xl border border-linen-border object-cover"
                      />
                    ) : (
                      <div className="flex h-36 w-36 items-center justify-center rounded-xl border border-linen-border bg-surface-container font-display text-5xl font-bold text-primary-container">
                        {tutor.displayName.slice(0, 1)}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex min-w-0 flex-col gap-2 text-start">
                    <h3 className="font-display text-lg font-extrabold text-on-surface">
                      {tutor.displayName}
                    </h3>
                    {tutor.tagline && (
                      <p className="text-sm text-on-surface-variant">
                        {tutor.tagline}
                      </p>
                    )}
                    {(tutor.totalLessonsCompleted > 0 || rating !== null) && (
                      <div className="flex flex-wrap items-center gap-3 text-xs text-secondary">
                        {tutor.totalLessonsCompleted > 0 && (
                          <span className="flex items-center gap-1">
                            <span
                              className="material-symbols-outlined text-base"
                              aria-hidden="true"
                            >
                              school
                            </span>
                            {tutor.totalLessonsCompleted.toLocaleString("he-IL")}{" "}
                            שיעורים
                          </span>
                        )}
                        {rating !== null && (
                          <span className="flex items-center gap-1">
                            <span className="font-bold text-on-surface">
                              {rating.toFixed(1)}
                            </span>
                            <span
                              className="material-symbols-outlined text-base text-tertiary-accent"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                              aria-hidden="true"
                            >
                              star
                            </span>
                            <span>({tutor.ratingCount} ביקורות)</span>
                          </span>
                        )}
                      </div>
                    )}
                    {tutor.shortBio && (
                      <p className="line-clamp-2 text-sm leading-relaxed text-on-surface-variant">
                        {tutor.shortBio}
                      </p>
                    )}
                  </div>

                  {/* Price */}
                  <div className="flex shrink-0 flex-col justify-center md:items-end md:text-end">
                    {price ? (
                      <>
                        <div className="font-display text-2xl font-extrabold text-on-surface">
                          {formatIlsCurrency(price.priceIls)}
                        </div>
                        <div className="text-[11px] text-secondary">
                          שיעור {price.minutes} דק׳
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-secondary">תמחור לא פורסם</div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
