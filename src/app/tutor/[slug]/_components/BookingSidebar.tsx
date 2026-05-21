"use client";

// Sticky aside that hosts the booking CTA on the public tutor profile.
// Story 3.2 follow-up 2026-05-18 — Preply-style 2-col layout.
//
// The sidebar shows the headline price + a few trust stats, and opens
// the BookingModal on click. The whole AvailabilityCalendar grid that
// used to live inline on the profile is gone — its replacement is the
// modal inside this component.
//
// Pricing-line behavior:
//   - If the tutor offers an "anchor" length (60 min by convention), we
//     show that; else fall back to the shortest offered length.
//   - The modal lets the student switch between all offered lengths.
//
// The hover/favorite/share buttons in the mock are decorative for now
// (closed-beta). We keep the cell shells to match the mock structure
// but render them disabled so accessibility checks don't trip.

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatIlsCurrency } from "@/lib/hebrew/format";
import type { SlotStatesByDay } from "@/lib/availability/compute-slots";
import { BookingModal, type LessonDurationMinutes } from "./BookingModal";

const ANCHOR_DURATION: LessonDurationMinutes = 60;

interface BookingSidebarProps {
  tutorUserId: string;
  displayName: string;
  profilePhotoUrl: string | null;
  prices: Record<LessonDurationMinutes, number | null>;
  ratingAverage: number | null;
  ratingCount: number;
  totalLessonsCompleted: number;
  slotStates: SlotStatesByDay;
  weekStartUtc: Date;
  isSignedIn: boolean;
  hasAnyAvailability: boolean;
  /**
   * True when the viewing user IS the tutor on this profile. Story 4.3
   * (PM round 2026-05-18): the CTA + modal are replaced by an "owner"
   * panel with a back-link to /tutor/me so a tutor can't book themselves.
   * The server's `runCreateBooking` enforces the same guard.
   */
  viewerIsOwner: boolean;
  /**
   * True when the viewing user is a tutor (single-role model — a tutor
   * never books lessons). Renders an informational panel instead of the
   * booking CTA + modal. `viewerIsOwner` takes precedence when the tutor
   * is viewing their own profile. The server gate in `checkoutHandoffAction`
   * / `submitCheckoutAction` is the load-bearing block.
   */
  viewerIsTutor?: boolean;
  /**
   * Pre-selected lesson length carried from the URL (`?duration=45`) for
   * deep-links from browse cards or marketing. Falls back to the sidebar's
   * headline duration when omitted.
   */
  initialDuration?: LessonDurationMinutes;
}

export function BookingSidebar({
  tutorUserId,
  displayName,
  profilePhotoUrl,
  prices,
  ratingAverage,
  ratingCount,
  totalLessonsCompleted,
  slotStates,
  weekStartUtc,
  isSignedIn,
  hasAnyAvailability,
  viewerIsOwner,
  viewerIsTutor = false,
  initialDuration,
}: BookingSidebarProps) {
  const [open, setOpen] = useState(false);

  if (viewerIsOwner) {
    return <OwnerPanel headlinePrice={null} />;
  }

  if (viewerIsTutor) {
    return <TutorViewerPanel />;
  }

  // Pick the headline duration. Prefer the URL-supplied `initialDuration`
  // when present AND offered, else 60 if offered, else the smallest
  // offered length.
  const offeredOrdered: LessonDurationMinutes[] = [45, 60, 75, 90];
  const offered = offeredOrdered.filter((d) => prices[d] !== null);
  const urlDurationIsOffered =
    initialDuration !== undefined && prices[initialDuration] !== null;
  const headlineDuration: LessonDurationMinutes = urlDurationIsOffered
    ? initialDuration!
    : prices[ANCHOR_DURATION] !== null
      ? ANCHOR_DURATION
      : (offered[0] ?? ANCHOR_DURATION);
  const headlinePrice = prices[headlineDuration];

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="bg-white rounded-2xl border border-linen-border shadow-sm p-6">
        {/* Price + duration */}
        <div className="flex items-baseline gap-2 mb-1">
          {headlinePrice !== null ? (
            <>
              <span className="font-display font-extrabold text-3xl text-on-surface">
                {formatIlsCurrency(headlinePrice)}
              </span>
              <span className="text-sm text-secondary">
                / שיעור {headlineDuration} דק׳
              </span>
            </>
          ) : (
            <span className="text-sm text-secondary">תמחור לא פורסם</span>
          )}
        </div>

        {/* Stats row — render whichever pieces exist */}
        {(ratingCount > 0 || totalLessonsCompleted > 0) && (
          <div className="flex items-center gap-5 mt-3 mb-5">
            {ratingCount > 0 && ratingAverage !== null && (
              <div className="text-start">
                <div className="flex items-center gap-1">
                  <span
                    className="material-symbols-outlined text-tertiary-accent text-lg"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                    aria-hidden="true"
                  >
                    star
                  </span>
                  <span className="font-bold text-lg">
                    {ratingAverage.toFixed(1)}
                  </span>
                </div>
                <div className="text-[11px] text-secondary">
                  {ratingCount} ביקורות
                </div>
              </div>
            )}
            {ratingCount > 0 && totalLessonsCompleted > 0 && (
              <div className="w-px h-8 bg-linen-border" />
            )}
            {totalLessonsCompleted > 0 && (
              <div className="text-start">
                <div className="font-bold text-lg">
                  {totalLessonsCompleted.toLocaleString("he-IL")}
                </div>
                <div className="text-[11px] text-secondary">שיעורים</div>
              </div>
            )}
          </div>
        )}

        {/* Primary CTA */}
        <Button
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          disabled={!hasAnyAvailability}
          onClick={() => setOpen(true)}
          iconLeading={
            <span
              className="material-symbols-outlined text-xl"
              aria-hidden="true"
            >
              event_available
            </span>
          }
        >
          {hasAnyAvailability ? "הזמינו שיעור" : "אין זמינות כרגע"}
        </Button>

        {/* Tax-compliance reassurance */}
        <div className="mt-4 text-[11px] text-secondary text-center leading-snug flex items-center justify-center gap-1">
          <span
            className="material-symbols-outlined text-base text-primary-container"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            verified
          </span>
          חשבונית מס דיגיטלית בסיום השיעור
        </div>
      </div>

      <BookingModal
        open={open}
        onClose={() => setOpen(false)}
        tutorUserId={tutorUserId}
        displayName={displayName}
        profilePhotoUrl={profilePhotoUrl}
        prices={prices}
        slotStates={slotStates}
        weekStartUtc={weekStartUtc}
        isSignedIn={isSignedIn}
        initialDuration={headlineDuration}
      />
    </aside>
  );
}

// ----- Owner panel --------------------------------------------------------
// Rendered in place of the booking CTA when the viewing user is the tutor
// on this profile (e.g. they navigated here via /tutor/me's "View public
// profile" link). The modal is not rendered at all.

function OwnerPanel(_props: { headlinePrice: number | null }) {
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="bg-white rounded-2xl border border-linen-border shadow-sm p-6 text-start">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="material-symbols-outlined text-primary-container text-2xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            visibility
          </span>
          <h3 className="font-display font-bold text-lg text-on-surface">
            זה הפרופיל שלך
          </h3>
        </div>
        <p className="text-sm text-on-surface-variant leading-relaxed mb-4">
          כך תלמידים פוטנציאליים רואים את הפרופיל שלך. כדי לערוך פרטים, זמינות
          או חשבוניות — חזרו לאזור המורה.
        </p>
        <Link
          href="/tutor/me"
          className="inline-flex items-center gap-1 text-sm font-bold text-primary-container hover:underline"
        >
          ← חזרה לאזור המורה
        </Link>
      </div>
    </aside>
  );
}

// ----- Tutor-viewer panel -------------------------------------------------
// Rendered in place of the booking CTA when a tutor views ANOTHER tutor's
// public profile. The single-role model (CLAUDE.md) means a tutor account
// never books lessons; the modal is not rendered at all. The server gate
// in `checkoutHandoffAction` / `submitCheckoutAction` enforces the rule.

function TutorViewerPanel() {
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="bg-white rounded-2xl border border-linen-border shadow-sm p-6 text-start">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="material-symbols-outlined text-primary-container text-2xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            cast_for_education
          </span>
          <h3 className="font-display font-bold text-lg text-on-surface">
            חשבון מורה
          </h3>
        </div>
        <p className="text-sm text-on-surface-variant leading-relaxed mb-4">
          חשבונות מורה אינם מזמינים שיעורים. כדי לנהל את הפרופיל, הזמינות
          והשיעורים שלך — עברו לאזור המורה.
        </p>
        <Link
          href="/tutor/me"
          className="inline-flex items-center gap-1 text-sm font-bold text-primary-container hover:underline"
        >
          ← לאזור המורה
        </Link>
      </div>
    </aside>
  );
}
