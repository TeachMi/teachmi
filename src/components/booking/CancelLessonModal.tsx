"use client";

// CancelLessonModal — Area 1.3 (2026-05-19). Founder + party-mode locked
// decisions:
//   - Student variant: low-friction. Collapsed optional reason field. Single
//     confirm button.
//   - Tutor variant: required reason. 3 presets (חולה / חירום משפחתי / טעות
//     בלוח) + "אחר" reveals a free-text field. Softer header copy.
//   - Both share the same Server Action (`cancelBookingAction`) — the
//     orchestrator derives the actor's role from the booking row, so the
//     client doesn't declare it. We pass `viewerRole` purely to pick the
//     right Hebrew copy + form shape.
//
// Rejected the existing mocks/cancel-modal.html mock per orchestrator
// flag (2026-05-19): it's student-only, mentions account credit, defaults
// to a reschedule action we don't ship, and uses "outside the penalty
// window" framing — none of which fits MVP1's free-cancel-up-to-start
// policy.
//
// State machine:  form → submitting → success → error
//   - 'form'        : user fills out + clicks confirm
//   - 'submitting'  : action in flight, buttons disabled
//   - 'success'     : show a brief "השיעור בוטל" flash, then close
//   - 'error'       : show formError inline; user can retry from 'form'
//
// On success the parent route's revalidatePath() (from the Server Action)
// refreshes the surrounding UI. We close the modal locally via a callback;
// no router push.

import { useState, type ReactNode } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalClose,
  ModalTrigger,
} from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  formatHebrewDate,
  formatHebrewWeekday,
} from "@/lib/hebrew/format";
import { cancelBookingAction } from "@/lib/booking/cancel-actions";
import { CANCEL_REASON_MAX_CHARS } from "@/lib/booking/cancel-flow";

export interface CancelLessonModalProps {
  bookingId: string;
  /** Who's viewing — drives header copy + form shape. */
  viewerRole: "student" | "tutor";
  /** Name of the other party (tutor's display name OR student's name). */
  counterpartName: string;
  /** Lesson start (UTC instant). */
  startsAt: Date;
  /** Lesson duration in minutes — for the summary line. */
  durationMinutes: number;
  /** Subject Hebrew display name. Optional — collapses cleanly when null. */
  subjectNameHe?: string | null;
  /** The trigger element (typically a Button). asChild via Radix. */
  children: ReactNode;
}

type Stage = "form" | "submitting" | "success" | "error";

// Per founder feedback 2026-05-19 — "טעות בלוח" was unclear (the original
// intent was "the time slot doesn't work for me anymore"). Renamed to
// "טעות בזמנים" which reads cleanly as "scheduling/timing mistake"
// without the ambiguous "לוח" word.
const TUTOR_PRESET_REASONS = [
  { value: "חולה", label: "חולה" },
  { value: "חירום משפחתי", label: "חירום משפחתי" },
  { value: "טעות בזמנים", label: "טעות בזמנים" },
  { value: "__other__", label: "אחר" },
] as const;

type TutorPresetValue = (typeof TUTOR_PRESET_REASONS)[number]["value"];

export function CancelLessonModal({
  bookingId,
  viewerRole,
  counterpartName,
  startsAt,
  durationMinutes,
  subjectNameHe,
  children,
}: CancelLessonModalProps) {
  // `open` is controlled so we can programmatically close on success.
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [formError, setFormError] = useState<string | null>(null);

  // Student-side reason: single free-text field, optional.
  const [studentReason, setStudentReason] = useState("");

  // Tutor-side reason: preset selection + optional free-text (when "אחר").
  const [tutorPreset, setTutorPreset] = useState<TutorPresetValue | "">("");
  const [tutorOtherText, setTutorOtherText] = useState("");

  function resetForm() {
    setStage("form");
    setFormError(null);
    setStudentReason("");
    setTutorPreset("");
    setTutorOtherText("");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Defer the reset so the closing animation doesn't show the form
      // morphing back from success state mid-fade.
      setTimeout(resetForm, 200);
    }
  }

  function buildReasonPayload(): { value: string | null; valid: boolean } {
    if (viewerRole === "student") {
      const trimmed = studentReason.trim();
      return { value: trimmed.length === 0 ? null : trimmed, valid: true };
    }
    // Tutor: preset is required. "אחר" requires free-text content.
    if (tutorPreset === "") {
      return { value: null, valid: false };
    }
    if (tutorPreset === "__other__") {
      const trimmed = tutorOtherText.trim();
      if (trimmed.length === 0) return { value: null, valid: false };
      return { value: trimmed, valid: true };
    }
    return { value: tutorPreset, valid: true };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { value: reason, valid } = buildReasonPayload();
    if (!valid) {
      setFormError(
        viewerRole === "tutor"
          ? "יש לבחור סיבה לביטול."
          : "אירעה שגיאה. נסו שוב.",
      );
      return;
    }
    setStage("submitting");
    setFormError(null);
    try {
      const result = await cancelBookingAction({ bookingId, reason });
      if (result.ok) {
        setStage("success");
        // Brief success flash, then close. revalidatePath in the action
        // refreshes the surrounding UI.
        setTimeout(() => handleOpenChange(false), 1400);
      } else {
        setStage("error");
        setFormError(result.formError);
      }
    } catch (err) {
      console.error("[CancelLessonModal] cancelBookingAction threw", err);
      setStage("error");
      setFormError("אירעה שגיאה. נסו שוב.");
    }
  }

  const isStudent = viewerRole === "student";
  const headerTitle = isStudent ? "ביטול שיעור" : "ביטול שיעור";
  const headerSub = isStudent
    ? null
    : "אני צריך/ה לבטל את השיעור. התלמיד יקבל הודעה והזיכוי הכספי יבוצע אוטומטית.";

  const submitDisabled =
    stage === "submitting" ||
    stage === "success" ||
    (viewerRole === "tutor" && !buildReasonPayload().valid);

  return (
    <Modal open={open} onOpenChange={handleOpenChange}>
      <ModalTrigger asChild>{children}</ModalTrigger>
      <ModalContent size="md">
        <form onSubmit={handleSubmit}>
          <ModalHeader tone={isStudent ? "default" : "danger"}>
            <ModalTitle>{headerTitle}</ModalTitle>
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
            {/* Booking summary */}
            <div className="rounded-xl border border-linen-border bg-linen p-4 text-sm">
              <div className="font-bold text-on-surface">
                {counterpartName}
                {subjectNameHe ? ` · ${subjectNameHe}` : ""}
              </div>
              <div className="mt-1 text-xs text-secondary">
                {formatHebrewWeekday(startsAt)} · {formatHebrewDate(startsAt)} ·{" "}
                {formatTime(startsAt)} · {durationMinutes} דק׳
              </div>
            </div>

            {headerSub && (
              <p className="text-sm text-on-surface-variant leading-relaxed">
                {headerSub}
              </p>
            )}

            {/* Form body */}
            {stage !== "success" &&
              (isStudent ? (
                <StudentReasonField
                  value={studentReason}
                  onChange={setStudentReason}
                  disabled={stage === "submitting"}
                />
              ) : (
                <TutorReasonFields
                  preset={tutorPreset}
                  onPresetChange={(v) => {
                    setTutorPreset(v);
                    setFormError(null);
                  }}
                  otherText={tutorOtherText}
                  onOtherTextChange={setTutorOtherText}
                  disabled={stage === "submitting"}
                />
              ))}

            {/* Policy reminder — same copy for both actors (MVP1: free cancel up to start). */}
            {stage !== "success" && (
              <div className="flex items-start gap-2 rounded-lg border border-primary-fixed-dim bg-primary-fixed/30 p-3 text-xs leading-relaxed text-on-surface-variant">
                <span
                  className="material-symbols-outlined shrink-0 text-base text-primary-container"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  verified
                </span>
                <p>
                  ביטול חינם עד תחילת השיעור. הזיכוי המלא יזוכה אוטומטית. (בטא
                  סגורה — לא בוצע חיוב כספי בפועל.)
                </p>
              </div>
            )}

            {formError && (
              <div
                role="alert"
                className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm font-bold text-danger"
              >
                {formError}
              </div>
            )}

            {stage === "success" && (
              <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-bold text-success">
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  check_circle
                </span>
                השיעור בוטל.
              </div>
            )}
          </ModalBody>

          {stage !== "success" && (
            <ModalFooter>
              <Button
                type="submit"
                variant="danger"
                size="md"
                disabled={submitDisabled}
                loading={stage === "submitting"}
              >
                {isStudent ? "אישור ביטול" : "אשרו ביטול"}
              </Button>
              <ModalClose asChild>
                <Button type="button" variant="outline" size="md">
                  חזרה
                </Button>
              </ModalClose>
            </ModalFooter>
          )}
        </form>
      </ModalContent>
    </Modal>
  );
}

function StudentReasonField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 inline-flex items-baseline gap-1 font-bold text-on-surface">
        הערה למורה
        <span className="text-xs font-normal text-secondary">(אופציונלי)</span>
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        maxLength={CANCEL_REASON_MAX_CHARS}
        placeholder="ספרו על הסיבה לביטול (לא חובה)"
        className="w-full rounded-lg border border-linen-border bg-surface-lowest px-3 py-2.5 text-sm text-on-surface placeholder:text-secondary focus:border-primary-fixed-dim focus:outline-none focus:ring-1 focus:ring-primary-fixed-dim disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function TutorReasonFields({
  preset,
  onPresetChange,
  otherText,
  onOtherTextChange,
  disabled,
}: {
  preset: TutorPresetValue | "";
  onPresetChange: (v: TutorPresetValue) => void;
  otherText: string;
  onOtherTextChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <fieldset className="text-sm">
        <legend className="mb-2 font-bold text-on-surface">
          סיבת הביטול <span className="text-xs font-normal text-danger">*</span>
        </legend>
        <div className="space-y-1.5">
          {TUTOR_PRESET_REASONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 rounded-lg border border-linen-border bg-surface-lowest px-3 py-2.5 hover:border-primary-fixed-dim has-[:checked]:border-primary-fixed-dim has-[:checked]:bg-primary-fixed/20"
            >
              <input
                type="radio"
                name="tutor-cancel-reason"
                value={opt.value}
                checked={preset === opt.value}
                onChange={() => onPresetChange(opt.value)}
                disabled={disabled}
                className="text-primary-container focus:ring-primary-fixed-dim"
              />
              <span className="text-sm font-bold text-on-surface">{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {preset === "__other__" && (
        <label className="block text-sm">
          <span className="mb-1.5 inline-block font-bold text-on-surface">
            פירוט
          </span>
          <textarea
            value={otherText}
            onChange={(e) => onOtherTextChange(e.target.value)}
            disabled={disabled}
            rows={3}
            maxLength={CANCEL_REASON_MAX_CHARS}
            placeholder="פרטו בקצרה"
            required
            className="w-full rounded-lg border border-linen-border bg-surface-lowest px-3 py-2.5 text-sm text-on-surface placeholder:text-secondary focus:border-primary-fixed-dim focus:outline-none focus:ring-1 focus:ring-primary-fixed-dim disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
      )}
    </div>
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
