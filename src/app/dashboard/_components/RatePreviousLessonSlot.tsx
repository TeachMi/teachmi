// Dashboard slot listing recent completed-but-unrated lessons (Story 5.x
// 2026-05-19). One card per lesson with an inline "כתבו ביקורת" button
// that opens a star-rating modal. RSC wrapper; the modal itself is a
// Client Component (`RateLessonCard`) so each card manages its own open
// state independently.
//
// Decisions:
//   - Inline-on-card placement (John's call). No nag-strip — closed beta
//     scale doesn't warrant the conversion-driver pattern; if a tutor's
//     last lesson card has a "כתבו ביקורת" button that's enough surface.
//   - Empty state: return null. The dashboard right rail (`WeeklySummary`
//     + `QuickLinks`) lives below; we don't want a "no pending reviews"
//     stub taking up vertical space.
//   - "ל. כ. · מאי 2026" date format isn't used here — this is the
//     STUDENT's own dashboard, not the reviewer-anonymized public view.

import { auth } from "@/lib/auth/auth";
import { getUnratedCompletedLessonsForStudent } from "@/lib/db/queries/booking-queries";
import { getFilesProvider } from "@/lib/providers/files";
import { RateLessonCard } from "./RateLessonCard";

const PRESIGNED_URL_TTL_SEC = 3600;

async function presignTutorPhoto(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    return await getFilesProvider().generatePresignedGetUrl({
      bucket: "tutor-profile-photos",
      key,
      expiresInSec: PRESIGNED_URL_TTL_SEC,
    });
  } catch (err) {
    console.error("[RatePreviousLessonSlot] presign failed", err);
    return null;
  }
}

export async function RatePreviousLessonSlot() {
  const session = await auth();
  const studentUserId = session?.user?.id;
  if (!studentUserId) return null;

  const lessons = await getUnratedCompletedLessonsForStudent(studentUserId);
  if (lessons.length === 0) return null;

  // Pre-resolve tutor photo URLs in parallel. At MAX_UNRATED_LESSONS=5
  // the upper bound is 5 presign calls — well within batch limits.
  const enriched = await Promise.all(
    lessons.map(async (lesson) => ({
      lesson,
      tutorProfilePhotoUrl: await presignTutorPhoto(lesson.tutorProfilePhotoR2Key),
    })),
  );

  return (
    <section
      aria-labelledby="rate-previous-heading"
      className="bg-white rounded-2xl border border-linen-border shadow-sm p-5"
    >
      <h2
        id="rate-previous-heading"
        className="font-display font-bold text-lg text-on-surface mb-1"
      >
        כתבו ביקורת
      </h2>
      <p className="text-xs text-secondary mb-4">
        על השיעורים האחרונים שלכם
      </p>
      <div className="space-y-3">
        {enriched.map(({ lesson, tutorProfilePhotoUrl }) => (
          <RateLessonCard
            key={lesson.lessonSessionId}
            lessonSessionId={lesson.lessonSessionId}
            tutorUserId={lesson.tutorUserId}
            tutorDisplayName={lesson.tutorDisplayName}
            tutorProfilePhotoUrl={tutorProfilePhotoUrl}
            subjectNameHe={lesson.subjectNameHe}
            startsAt={lesson.startsAt}
          />
        ))}
      </div>
    </section>
  );
}
