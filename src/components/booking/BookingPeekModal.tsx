"use client";

// BookingPeekModal — Area 1 / party-mode 2026-05-19. Tutor-only modal
// surfaced when the tutor taps a booked cell in the 4-week schedule
// calendar OR a row in the upcoming-lessons strip. Per founder + Sally
// (rule/reality split round), this is the canonical "I tapped a booking"
// interaction on the tutor surface — same component in both places to
// avoid two-grammars-for-one-object (John's call).
//
// Layout (Sally's anatomy):
//   - Header: student name (large, semibold)
//   - Subtitle: subject + date + time + duration
//   - Primary action: "פתח דף תלמיד" → /tutor/students/{studentId}
//     (live stub per Winston's guardrails)
//   - Secondary action: "בטל שיעור" — opens the CancelLessonModal on top
//     of this peek (Radix nesting handles stacking)
//
// Why nested modals: when the cancel modal closes (success flash or
// dismiss), the peek stays open underneath so the tutor can re-engage if
// needed. The visual "modal-over-modal" is minor — both backdrops fade
// when the cancel closes, leaving the peek alone. Acceptable trade-off
// for keeping cancel modal a single composable component (reused as-is on
// /booking/[id]/confirmed).

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalClose,
  ModalTrigger,
} from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  formatHebrewDate,
  formatHebrewWeekday,
} from "@/lib/hebrew/format";
import { CancelLessonModal } from "./CancelLessonModal";

export interface BookingPeekModalProps {
  bookingId: string;
  studentUserId: string;
  studentName: string;
  startsAt: Date;
  durationMinutes: number;
  subjectNameHe?: string | null;
  /** Trigger element (the clickable cell or strip row). asChild via Radix. */
  children: ReactNode;
}

export function BookingPeekModal({
  bookingId,
  studentUserId,
  studentName,
  startsAt,
  durationMinutes,
  subjectNameHe,
  children,
}: BookingPeekModalProps) {
  return (
    <Modal>
      <ModalTrigger asChild>{children}</ModalTrigger>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>{studentName}</ModalTitle>
          <ModalClose
            aria-label="סגירה"
            className="rounded p-1 text-secondary hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fixed-dim"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </ModalClose>
        </ModalHeader>
        <ModalBody className="space-y-4 text-start">
          {/* Booking detail block */}
          <div className="rounded-xl border border-linen-border bg-linen p-4 text-sm">
            {subjectNameHe && (
              <div className="font-bold text-on-surface">{subjectNameHe}</div>
            )}
            <div className={subjectNameHe ? "mt-1 text-xs text-secondary" : "text-sm text-on-surface"}>
              {formatHebrewWeekday(startsAt)} · {formatHebrewDate(startsAt)} ·{" "}
              {formatTime(startsAt)} · {durationMinutes} דק׳
            </div>
          </div>

          {/* Stacked actions: navigation primary, destructive secondary. */}
          <div className="space-y-2">
            <Button asChild variant="primary" size="md" fullWidth>
              <Link href={`/tutor/students/${studentUserId}`}>
                פתח דף תלמיד
              </Link>
            </Button>
            <CancelLessonModal
              bookingId={bookingId}
              viewerRole="tutor"
              counterpartName={studentName}
              startsAt={startsAt}
              durationMinutes={durationMinutes}
              subjectNameHe={subjectNameHe}
            >
              <Button
                type="button"
                variant="ghost"
                size="md"
                fullWidth
                className="text-danger hover:text-red-700 hover:bg-danger/5"
              >
                בטל שיעור
              </Button>
            </CancelLessonModal>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jerusalem",
  }).format(d);
}
