"use server";

// Server Action for submitting a student rating on a completed lesson
// (Story 5.x 2026-05-19). Advisory-only — does NOT trigger any tutor
// status change (Wolt-defense concern #10).
//
// Architecture decisions (party-mode 2026-05-19):
//   - Unique key on `(lesson_session_id)` (already in schema) — one rating
//     per session. Per Winston: session is the durable identity for a
//     review; booking is a promise, session is the event.
//   - Aggregate update (`average_rating`, `rating_count`) is performed
//     INLINE in the same SQL chain as the INSERT. Deferred #8 says the
//     long-term solution is a Postgres trigger; until that lands we
//     denormalize manually so the public profile doesn't render a stale
//     "4.2" right after the student rated 5★.
//   - Returns serializable result (no `redirect()`) so the client modal
//     can show a success toast in place and dismiss itself.
//
// Validation:
//   - score must be 1..5 integer.
//   - comment is optional, capped at 1000 chars (the DB column is text,
//     no DB-side cap, but UI + abuse-vector reasons argue for one).
//   - The (student, lesson_session) pair must actually exist + the
//     session must be `completed` + the student must own it (i.e. the
//     booking row's `studentUserId` matches the session caller).

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db/client";
import {
  bookings,
  lessonSessions,
  ratings,
  tutorProfiles,
} from "@/lib/db/schema";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMENT_MAX_LEN = 1000;

/**
 * Strip Unicode bidirectional-override + isolate characters AND
 * zero-width / invisible characters from user-authored text. Same
 * defense as `stripBidiOverrides` on the public tutor profile — a
 * malicious comment in this Hebrew RTL marketplace can otherwise
 * visually reverse surrounding UI via U+202D / U+202E or sneak
 * invisible characters past dedup checks. NFC normalization
 * collapses canonically-equivalent sequences to a single form so
 * search/sort/dedupe later are stable.
 */
const BIDI_AND_INVISIBLE_RE = /[​-‏‪-‮⁦-⁩﻿]/g;
function sanitizeComment(raw: string): string {
  return raw.normalize("NFC").replace(BIDI_AND_INVISIBLE_RE, "");
}

export type SubmitRatingResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not_signed_in"
        | "bad_input"
        | "lesson_not_found"
        | "not_authorized"
        | "lesson_not_completed"
        | "already_rated"
        | "db_error";
    };

export async function submitRatingAction(
  formData: FormData,
): Promise<SubmitRatingResult> {
  const lessonSessionId = String(formData.get("lessonSessionId") ?? "").trim();
  const scoreRaw = String(formData.get("score") ?? "");
  const commentRaw = String(formData.get("comment") ?? "");

  if (!UUID_REGEX.test(lessonSessionId)) return { ok: false, reason: "bad_input" };
  const score = Number(scoreRaw);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { ok: false, reason: "bad_input" };
  }
  // Normalize + strip bidi / invisible chars BEFORE the length check —
  // an attacker padding the comment with 1000 zero-width chars
  // shouldn't push real content out of bounds.
  const commentSanitized = sanitizeComment(commentRaw).trim();
  const comment =
    commentSanitized.length === 0
      ? null
      : commentSanitized.slice(0, COMMENT_MAX_LEN);

  const session = await auth();
  const studentUserId = session?.user?.id;
  if (!studentUserId) return { ok: false, reason: "not_signed_in" };

  const db = getDb();

  // Look up the lesson_session + its booking. We need to confirm:
  //   - the session exists and is `completed`
  //   - the booking's student_user_id matches the caller (authz)
  //   - we also need the tutor_user_id for the rating row
  const sessionRows = await db
    .select({
      sessionId: lessonSessions.id,
      sessionStatus: lessonSessions.status,
      bookingStudentUserId: bookings.studentUserId,
      bookingTutorUserId: bookings.tutorUserId,
    })
    .from(lessonSessions)
    .innerJoin(bookings, eq(bookings.id, lessonSessions.bookingId))
    .where(eq(lessonSessions.id, lessonSessionId))
    .limit(1);
  const sessionRow = sessionRows[0];

  if (!sessionRow) return { ok: false, reason: "lesson_not_found" };
  if (sessionRow.bookingStudentUserId !== studentUserId) {
    return { ok: false, reason: "not_authorized" };
  }
  if (sessionRow.sessionStatus !== "completed") {
    return { ok: false, reason: "lesson_not_completed" };
  }

  // INSERT the rating row. The unique constraint on `lesson_session_id`
  // catches double-submits (e.g. two browser tabs). Translate the
  // pg error code into a clean "already_rated" reason.
  try {
    await db.insert(ratings).values({
      lessonSessionId: sessionRow.sessionId,
      studentUserId,
      tutorUserId: sessionRow.bookingTutorUserId,
      score,
      comment,
      createdByKind: "user",
      createdByActor: studentUserId,
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "already_rated" };
    console.error("[submitRatingAction] insert failed", err);
    return { ok: false, reason: "db_error" };
  }

  // Aggregate update — recompute from the source ratings rows rather
  // than incrementing-in-place. The recompute is O(N-for-this-tutor),
  // which is small (per-tutor count), and rebuilds the running average
  // against the actual data so we never drift. When deferred-#8 lands a
  // Postgres trigger, this UPDATE block becomes redundant and can be
  // dropped; the INSERT above is the load-bearing write.
  //
  // neon-http doesn't support transactions, so the brief window between
  // INSERT and the aggregate UPDATE is the failure surface — if the
  // process dies between the two, the next rating write self-heals via
  // the same recompute. Acceptable for closed beta; the trigger will
  // make it bulletproof.
  try {
    const tutorId = sessionRow.bookingTutorUserId;
    await db
      .update(tutorProfiles)
      .set({
        averageRating: sql`(SELECT AVG(score)::numeric(3,2) FROM ${ratings} WHERE ${ratings.tutorUserId} = ${tutorId})`,
        ratingCount: sql`(SELECT COUNT(*)::int FROM ${ratings} WHERE ${ratings.tutorUserId} = ${tutorId})`,
        updatedAt: new Date(),
        updatedByKind: "user",
        updatedByActor: studentUserId,
      })
      .where(eq(tutorProfiles.userId, tutorId));
  } catch (err) {
    // Aggregate update failure is logged but not surfaced — the rating
    // already landed in the ratings table. The stale aggregate self-
    // heals on next rating write OR when the deferred-#8 trigger lands.
    console.error("[submitRatingAction] aggregate update failed", err);
  }

  // Re-validate the affected surfaces so the public profile + dashboard
  // pick up the new rating without a full page reload.
  revalidatePath(`/tutor/${sessionRow.bookingTutorUserId}`);
  revalidatePath("/dashboard");

  return { ok: true };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}
