"use client";

// Full-width row card on `/browse` (Story 5.x 2026-05-19). Matches
// `mocks/browse-v2.html`:
//   - 160px square photo (with optional "verified" badge on the info side)
//   - Info block: name + tagline + stats + bio + highlight chips
//   - Price + primary CTA stacked on the (RTL) "outside" edge
//   - lg+ only: sticky hover preview panel to the side with the intro
//     video thumbnail. When the tutor has no video the panel is suppressed
//     entirely (founder direction: no penalty rendering for video-less
//     rows; in MVP1 closed beta all mock tutors will have a video).
//
// Interaction model:
//   - Click anywhere on the row that isn't a button/anchor → navigate to
//     /tutor/[userId]. The row itself is `role="link"` for keyboard / SR
//     parity.
//   - "קביעת שיעור" → open BookingModal in-place with lazy-fetched
//     tutor context (Server Action). No navigation.
//   - Video thumbnail in hover panel → open BrowseVideoModal in-place.
//   - Cancel framing locked: copy is "קביעת שיעור" — NOT "שיעור היכרות"
//     (trial-lesson framing was dropped two stories ago; CLAUDE.md).

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getHighlight, isHighlightSlug } from "@/lib/highlights";
import { formatIlsCurrency } from "@/lib/hebrew/format";
import { Button } from "@/components/ui/button";
import {
  BookingModal,
  type LessonDurationMinutes,
} from "@/app/tutor/[slug]/_components/BookingModal";
import { getTutorBookingContext } from "@/lib/booking/get-tutor-booking-context";
import {
  rehydrateSlotStates,
  type TutorBookingContext,
} from "@/lib/booking/tutor-booking-context-types";
import { BrowseVideoModal } from "./BrowseVideoModal";

export interface BrowseRowTutor {
  userId: string;
  displayName: string;
  gender: "male" | "female";
  tagline: string | null;
  shortBio: string | null;
  highlights: string[] | null;
  lesson45PriceIls: number | null;
  hourlyPriceIls: number | null;
  lesson75PriceIls: number | null;
  lesson90PriceIls: number | null;
  averageRating: string | null;
  ratingCount: number;
  totalLessonsCompleted: number;
}

type OfferedDuration = 45 | 60 | 75 | 90;
const ANCHOR_DURATION: OfferedDuration = 60;

/**
 * Collect every lesson length the tutor offers, paired with its price.
 * Sorted by duration ascending so the list reads as a natural ladder
 * (45 → 60 → 75 → 90). Empty when none of the four lengths is set;
 * the card shows "תמחור לא פורסם" in that case.
 */
function collectOfferedDurations(
  tutor: BrowseRowTutor,
): Array<{ durationMinutes: OfferedDuration; priceIls: number }> {
  const out: Array<{ durationMinutes: OfferedDuration; priceIls: number }> = [];
  if (tutor.lesson45PriceIls !== null)
    out.push({ durationMinutes: 45, priceIls: tutor.lesson45PriceIls });
  if (tutor.hourlyPriceIls !== null)
    out.push({ durationMinutes: 60, priceIls: tutor.hourlyPriceIls });
  if (tutor.lesson75PriceIls !== null)
    out.push({ durationMinutes: 75, priceIls: tutor.lesson75PriceIls });
  if (tutor.lesson90PriceIls !== null)
    out.push({ durationMinutes: 90, priceIls: tutor.lesson90PriceIls });
  return out;
}

interface BrowseRowProps {
  tutor: BrowseRowTutor;
  /** Presigned R2 URL for the photo. Null = render initial-letter fallback. */
  profilePhotoUrl: string | null;
  /** Presigned R2 URL for the intro video. Null = suppress the hover preview panel. */
  introVideoUrl: string | null;
  /**
   * Active lesson-length filter from the URL. When set, the card shows
   * THAT length's price + duration; the "other lengths" indicator is
   * hidden. When null, the card falls back to the 60-min anchor (or
   * shortest offered if 60 isn't priced) and the indicator surfaces
   * the alternatives.
   */
  selectedLengthMinutes: 45 | 60 | 75 | 90 | null;
  /**
   * Whether the viewer may book a lesson. `false` for logged-in tutors —
   * the single-role model (CLAUDE.md) means a tutor account never books.
   * When false the "קביעת שיעור" CTA is hidden here and in the video
   * modal; `checkoutHandoffAction` is the load-bearing server gate.
   * Defaults to `true` (anonymous + student viewers can book).
   */
  canBook?: boolean;
}

/**
 * Pick the duration whose price is the row's headline.
 * Priority:
 *   1. The active filter, when set AND the tutor offers it. (DB-side
 *      filter already excluded tutors that don't, so this is just
 *      defense-in-depth.)
 *   2. The 60-min anchor when offered.
 *   3. The shortest offered length.
 *   4. `null` when nothing is priced — the card shows "תמחור לא פורסם".
 */
function pickHeadlineDuration(
  offered: ReturnType<typeof collectOfferedDurations>,
  filtered: OfferedDuration | null,
): OfferedDuration | null {
  if (offered.length === 0) return null;
  if (filtered !== null) {
    const match = offered.find((o) => o.durationMinutes === filtered);
    if (match) return match.durationMinutes;
  }
  const anchor = offered.find((o) => o.durationMinutes === ANCHOR_DURATION);
  return anchor?.durationMinutes ?? offered[0]!.durationMinutes;
}

export function BrowseRow({
  tutor,
  profilePhotoUrl,
  introVideoUrl,
  selectedLengthMinutes,
  canBook = true,
}: BrowseRowProps) {
  const router = useRouter();
  const profileHref = `/tutor/${tutor.userId}`;

  const [bookingOpen, setBookingOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoBroken, setVideoBroken] = useState(false);
  const [context, setContext] = useState<TutorBookingContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // React 19's "reset state on prop change" idiom — track the previous
  // filter value and reset the cached context during render when it
  // changes. Avoids the cascading-render warning that a `useEffect`
  // with `setContext(null)` would trigger; same effect, one render
  // cycle instead of two.
  const [prevSelectedLength, setPrevSelectedLength] = useState<
    typeof selectedLengthMinutes
  >(selectedLengthMinutes);
  if (prevSelectedLength !== selectedLengthMinutes) {
    setPrevSelectedLength(selectedLengthMinutes);
    setContext(null);
  }

  const offeredDurations = collectOfferedDurations(tutor);
  const headlineDuration = pickHeadlineDuration(
    offeredDurations,
    selectedLengthMinutes,
  );
  const headlineOption = headlineDuration
    ? offeredDurations.find((o) => o.durationMinutes === headlineDuration)
    : null;
  const validHighlights = (tutor.highlights ?? []).filter(isHighlightSlug);

  // Lazy-load the booking context on first open. Cached per-component
  // so subsequent opens (same length filter) don't re-fetch.
  const openBookingModal = () => {
    // Reset any stale error from a previous failed open so the sr-only
    // alert doesn't fire on a successful retry.
    setContextError(null);
    if (context !== null) {
      setBookingOpen(true);
      return;
    }
    startTransition(async () => {
      try {
        const ctx = await getTutorBookingContext(
          tutor.userId,
          headlineDuration ?? undefined,
        );
        if (ctx === null) {
          setContextError("not_found");
          // Fall through: open the modal anyway with an empty-state body.
          // Better UX than a silent no-op on click.
          setBookingOpen(true);
          return;
        }
        setContext(ctx);
        setBookingOpen(true);
      } catch (err) {
        console.error("[BrowseRow] booking context fetch failed", err);
        setContextError("fetch_failed");
        setBookingOpen(true);
      }
    });
  };

  // Card-level click: navigate to /tutor unless the click landed inside a
  // button or anchor. Suppressed while a booking-context fetch is
  // in-flight so a stray card click doesn't navigate away mid-load.
  const onCardClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (isPending) return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    router.push(profileHref);
  };
  const onCardKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (isPending) return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    e.preventDefault();
    router.push(profileHref);
  };

  return (
    <div className="tutor-row flex gap-4 items-stretch group">
      {/* Main card */}
      <div
        role="link"
        tabIndex={0}
        onClick={onCardClick}
        onKeyDown={onCardKeyDown}
        aria-label={`${tutor.displayName} — לפרופיל המלא`}
        className="tutor-card flex-1 bg-white rounded-2xl border border-linen-border p-5 hover:shadow-lg hover:border-primary-fixed-dim transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-fixed-dim"
      >
        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_180px] gap-5">
          {/* Photo */}
          <div className="relative shrink-0">
            {profilePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profilePhotoUrl}
                alt={tutor.displayName}
                width={160}
                height={160}
                className="w-40 h-40 rounded-xl object-cover border border-linen-border"
              />
            ) : (
              <div className="w-40 h-40 rounded-xl bg-surface-container border border-linen-border flex items-center justify-center text-primary-container font-display font-bold text-5xl">
                {tutor.displayName.slice(0, 1)}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="text-start min-w-0 flex flex-col gap-2">
            <h3 className="font-display font-extrabold text-xl text-on-surface">
              {tutor.displayName}
            </h3>

            {tutor.tagline && (
              <p className="text-sm text-on-surface-variant">{tutor.tagline}</p>
            )}

            {(tutor.totalLessonsCompleted > 0 || tutor.ratingCount > 0) && (
              <div className="flex items-center gap-3 text-xs text-secondary flex-wrap">
                {tutor.totalLessonsCompleted > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-base">school</span>
                    {tutor.totalLessonsCompleted.toLocaleString("he-IL")} שיעורים
                  </span>
                )}
                {tutor.totalLessonsCompleted > 0 && tutor.ratingCount > 0 && (
                  <span aria-hidden="true">·</span>
                )}
                {tutor.ratingCount > 0 &&
                  tutor.averageRating !== null &&
                  Number.isFinite(Number(tutor.averageRating)) && (
                  <span className="flex items-center gap-1">
                    <span className="font-bold text-on-surface">
                      {Number(tutor.averageRating).toFixed(1)}
                    </span>
                    <span
                      className="material-symbols-outlined text-tertiary-accent text-base"
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
              <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-3">
                {tutor.shortBio}
              </p>
            )}

            {validHighlights.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {validHighlights.slice(0, 4).map((slug) => {
                  const def = getHighlight(slug);
                  return (
                    <span
                      key={slug}
                      className="bg-primary-fixed/40 text-primary-container text-[11px] px-2 py-1 rounded-md font-bold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-xs" aria-hidden="true">
                        {def.icon}
                      </span>
                      {def.labelHe}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Price + CTA — single headline price for the active length
              filter (or the 60-min anchor if no filter), with a small
              indicator listing OTHER lengths the tutor also offers. */}
          <div className="flex flex-col items-end justify-between text-end shrink-0 gap-3">
            <div className="text-end">
              {headlineOption ? (
                <>
                  <div className="font-display font-extrabold text-2xl text-on-surface leading-tight">
                    {formatIlsCurrency(headlineOption.priceIls)}
                  </div>
                  <div className="text-[11px] text-secondary mt-0.5">
                    שיעור {headlineOption.durationMinutes} דק׳
                  </div>
                </>
              ) : (
                <div className="text-sm text-secondary">תמחור לא פורסם</div>
              )}
            </div>
            {canBook && (
              <Button
                type="button"
                variant="primary"
                fullWidth
                onClick={openBookingModal}
                disabled={isPending}
                aria-busy={isPending}
              >
                {isPending ? "טוען…" : "קביעת שיעור"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Preview panel column.
          ALWAYS rendered at lg+ to keep card widths uniform across rows
          (founder direction R2 2026-05-20: no elongated cards for
          video-less tutors). When the tutor has no video the slot is
          empty — hover does nothing. When they have one, the panel
          fades in on `group-hover:` and reveals:
            - the video first-frame poster (`#t=0.1` media fragment)
            - a "לפרופיל המלא" link at the bottom that navigates to the
              tutor profile (same destination as a card click)
          The frame matches the card's own chrome (rounded-2xl, white,
          linen border) so the panel reads as a sibling card. The outer
          row uses `items-stretch` so the frame matches the card height. */}
      <aside
        aria-hidden={introVideoUrl === null}
        className="hidden lg:block w-[260px] shrink-0"
      >
        {introVideoUrl !== null && (
          <div className="h-full lg:invisible lg:opacity-0 lg:translate-y-1 transition-all duration-150 lg:group-hover:visible lg:group-hover:opacity-100 lg:group-hover:translate-y-0 lg:group-focus-within:visible lg:group-focus-within:opacity-100 lg:group-focus-within:translate-y-0">
            <div className="h-full flex flex-col bg-white rounded-2xl border border-linen-border shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                aria-label={`צפייה בסרטון ההיכרות של ${tutor.displayName}`}
                className="block w-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-fixed-dim"
                disabled={videoBroken}
              >
                <div className="relative aspect-video bg-black">
                  {videoBroken ? (
                    // Fallback when the presigned URL expired / 404'd:
                    // show the profile photo where the video poster
                    // would have been, plus a small "no video" affordance
                    // so the user knows it's not a click target.
                    profilePhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profilePhotoUrl}
                        alt=""
                        className="w-full h-full object-cover opacity-80"
                      />
                    ) : (
                      <div className="w-full h-full bg-surface-container" />
                    )
                  ) : (
                    <>
                      {/* First-frame poster via `#t=0.1` media fragment.
                          `preload="metadata"` keeps bandwidth small — the
                          browser only fetches enough of the moov atom to
                          paint the seek-to-0.1s frame. No JS needed.
                          `onError` swaps to the photo fallback if the
                          R2 presigned URL is unreachable. */}
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video
                        src={`${introVideoUrl}#t=0.1`}
                        preload="metadata"
                        muted
                        playsInline
                        onError={() => setVideoBroken(true)}
                        className="w-full h-full object-cover pointer-events-none"
                      />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-14 h-14 bg-white/95 rounded-full flex items-center justify-center shadow-lg">
                          <span
                            className="material-symbols-outlined text-primary-container text-3xl"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                            aria-hidden="true"
                          >
                            play_arrow
                          </span>
                        </span>
                      </span>
                    </>
                  )}
                </div>
              </button>
              {/* Profile-link CTA — `mt-auto` pushes it to the bottom
                  of the flex column so the frame fills the row height
                  with the link anchored. Clicks here navigate
                  independently of the card's click handler (the link
                  sits OUTSIDE the card's clickable div). */}
              <a
                href={profileHref}
                className="mt-auto block border-t border-linen-border px-4 py-3 text-center text-sm font-bold text-primary-container hover:bg-linen transition-colors"
              >
                לפרופיל המלא ←
              </a>
            </div>
          </div>
        )}
      </aside>

      {/* Video modal — separate from the row tree so it portals correctly
          and isn't affected by the row's overflow rules. */}
      {introVideoUrl !== null && videoOpen && (
        <BrowseVideoModal
          videoUrl={introVideoUrl}
          displayName={tutor.displayName}
          tagline={tutor.tagline}
          profileHref={profileHref}
          canBook={canBook}
          onClose={() => setVideoOpen(false)}
          onBookClick={() => {
            setVideoOpen(false);
            openBookingModal();
          }}
        />
      )}

      {/* Booking modal mount.
          - `context === null` means the tutor was not discoverable at fetch
            time (or the action failed). Render the modal with empty slots so
            the user sees the existing "אין זמינות ביום זה" body and the
            empty-state escape (`fallbackProfileHref`).
          - The BookingModal itself is prop-driven (audit 2026-05-19), so
            it works identically here and on the profile page. */}
      {bookingOpen && (
        <BookingModal
          open={bookingOpen}
          onClose={() => setBookingOpen(false)}
          tutorUserId={tutor.userId}
          displayName={context?.displayName ?? tutor.displayName}
          profilePhotoUrl={context?.profilePhotoUrl ?? profilePhotoUrl}
          prices={
            context?.prices ?? {
              45: tutor.lesson45PriceIls,
              60: tutor.hourlyPriceIls,
              75: tutor.lesson75PriceIls,
              90: tutor.lesson90PriceIls,
            }
          }
          slotStates={
            context
              ? rehydrateSlotStates(context.slotStates)
              : (new Map() as ReturnType<typeof rehydrateSlotStates>)
          }
          weekStartUtc={
            context ? new Date(context.weekStartUtcIso) : new Date()
          }
          isSignedIn={context?.isSignedIn ?? false}
          initialDuration={
            (context?.initialDuration ??
              headlineDuration ??
              60) as LessonDurationMinutes
          }
          // The "ראו פרופיל מלא" escape kicks in when the modal renders
          // its empty-state body. Click → navigate to the profile page.
          fallbackProfileHref={profileHref}
        />
      )}

      {contextError !== null && (
        <span className="sr-only" role="alert">
          טעינת הזמינות נכשלה. אנא נסו שוב.
        </span>
      )}
    </div>
  );
}
