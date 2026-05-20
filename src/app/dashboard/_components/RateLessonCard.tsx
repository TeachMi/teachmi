"use client";

// One row of the "כתבו ביקורת" stack on the student dashboard. Each card
// owns its own modal open-state — opening one doesn't close another, and
// closing the modal returns focus to the card's CTA.
//
// Submission flow:
//   1. Student picks 1-5 stars (required) + optional comment.
//   2. Form posts to `submitRatingAction` (server action).
//   3. On success: card disappears (server-side re-render via the action's
//      `revalidatePath("/dashboard")` call) — same surface, fresh data.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { submitRatingAction } from "@/lib/ratings/submit-rating-action";

interface RateLessonCardProps {
  lessonSessionId: string;
  tutorUserId: string;
  tutorDisplayName: string | null;
  tutorProfilePhotoUrl: string | null;
  subjectNameHe: string | null;
  startsAt: Date;
}

const HEBREW_DATE_FORMATTER = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  timeZone: "Asia/Jerusalem",
});

const COMMENT_MAX_LEN = 1000;

export function RateLessonCard({
  lessonSessionId,
  tutorUserId,
  tutorDisplayName,
  tutorProfilePhotoUrl,
  subjectNameHe,
  startsAt,
}: RateLessonCardProps) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const displayName = tutorDisplayName ?? "המורה";
  const lessonDateLabel = HEBREW_DATE_FORMATTER.format(startsAt);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Block re-entry while a submission is in-flight. The button has
    // `disabled={isPending}` already, but Enter-key submissions bypass
    // that (form-level submit fires on the form, not the button).
    if (isPending) return;
    setErrorReason(null);
    if (score < 1 || score > 5) {
      setErrorReason("bad_input");
      return;
    }
    const fd = new FormData();
    fd.set("lessonSessionId", lessonSessionId);
    fd.set("score", String(score));
    fd.set("comment", comment);
    startTransition(async () => {
      const result = await submitRatingAction(fd);
      if (result.ok) {
        setOpen(false);
        // The action calls revalidatePath("/dashboard"), so Next 16 will
        // re-render the parent server component and this card will be
        // gone on the next paint. No additional client-side cleanup
        // needed.
        return;
      }
      setErrorReason(result.reason);
    });
  };

  return (
    <article className="flex items-center gap-3 bg-surface-low rounded-xl border border-linen-border p-3">
      {tutorProfilePhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tutorProfilePhotoUrl}
          alt={displayName}
          width={44}
          height={44}
          className="w-11 h-11 rounded-lg object-cover"
        />
      ) : (
        <div className="w-11 h-11 rounded-lg bg-surface-container flex items-center justify-center text-primary-container font-bold text-base">
          {displayName.charAt(0)}
        </div>
      )}
      <div className="flex-1 min-w-0 text-start">
        <p className="font-bold text-sm text-on-surface truncate">{displayName}</p>
        <p className="text-[11px] text-secondary truncate">
          {subjectNameHe ? `${subjectNameHe} · ` : ""}
          {lessonDateLabel}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-bold text-primary-container border border-primary-container hover:bg-linen rounded-lg px-3 py-2 transition-colors"
      >
        כתבו ביקורת
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/45"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`rate-${lessonSessionId}-title`}
        >
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
            <form onSubmit={onSubmit}>
              {/* Header */}
              <div className="p-5 border-b border-linen-border flex items-start gap-3">
                <div className="flex-1 text-start">
                  <h3
                    id={`rate-${lessonSessionId}-title`}
                    className="font-display font-bold text-lg text-on-surface"
                  >
                    איך היה השיעור?
                  </h3>
                  <p className="text-xs text-secondary mt-0.5">
                    {displayName} · {lessonDateLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="סגירה"
                  className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center -mt-1"
                >
                  <span className="material-symbols-outlined text-secondary">close</span>
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-5">
                {/* Star picker */}
                <fieldset>
                  <legend className="text-sm font-bold text-on-surface mb-3">
                    דירוג
                  </legend>
                  <div className="flex gap-1" dir="ltr">
                    {/* LTR for the star row — left = 1, right = 5 — matches
                        almost every rating UI in the wild. RTL would put
                        5★ on the left, which is the opposite of muscle
                        memory. */}
                    {[1, 2, 3, 4, 5].map((s) => {
                      const filled = s <= score;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setScore(s)}
                          aria-label={`${s} כוכבים`}
                          aria-pressed={s === score}
                          className="p-1 rounded hover:bg-surface-container"
                        >
                          <span
                            className={`material-symbols-outlined text-4xl ${filled ? "text-tertiary-accent" : "text-surface-container"}`}
                            style={{ fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0" }}
                          >
                            star
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Comment */}
                <div>
                  <label
                    htmlFor={`rate-${lessonSessionId}-comment`}
                    className="block text-sm font-bold text-on-surface mb-2"
                  >
                    מה תרצו לספר על השיעור? <span className="text-secondary font-normal">(לא חובה)</span>
                  </label>
                  <textarea
                    id={`rate-${lessonSessionId}-comment`}
                    value={comment}
                    onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX_LEN))}
                    rows={4}
                    placeholder="מה עזר לכם? מה היה חסר?"
                    className="w-full rounded-lg border border-linen-border bg-white px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-fixed-dim"
                  />
                  <p className="text-[11px] text-secondary text-end mt-1">
                    {comment.length}/{COMMENT_MAX_LEN}
                  </p>
                </div>

                {errorReason && (
                  <p className="text-xs text-red-700" role="alert">
                    {humanizeError(errorReason)}
                  </p>
                )}

                <p className="text-[11px] text-secondary leading-relaxed">
                  הביקורת תוצג בפרופיל הציבורי של {displayName}. שמך לא יוצג, רק
                  האות הראשונה.
                </p>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-linen-border bg-white flex flex-row-reverse gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  disabled={isPending || score < 1}
                  aria-busy={isPending}
                >
                  {isPending ? "שולח…" : "שלחו ביקורת"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden field so the link to the tutor profile is available for
          assistive tech if the modal is closed mid-flow. */}
      <span className="sr-only">
        קישור לפרופיל המורה: /tutor/{tutorUserId}
      </span>
    </article>
  );
}

function humanizeError(reason: string): string {
  switch (reason) {
    case "not_signed_in":
      return "עליכם להתחבר כדי לכתוב ביקורת.";
    case "bad_input":
      return "אנא בחרו דירוג בין 1 ל-5 כוכבים.";
    case "lesson_not_found":
      return "השיעור לא נמצא.";
    case "not_authorized":
      return "אין הרשאה לדרג שיעור זה.";
    case "lesson_not_completed":
      return "ניתן לדרג רק שיעור שהסתיים.";
    case "already_rated":
      return "כבר דרגתם את השיעור הזה.";
    default:
      return "אירעה שגיאה. נסו שוב.";
  }
}
