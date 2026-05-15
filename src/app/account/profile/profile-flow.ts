// Pure orchestrator for the profile-update server action. Tested via the
// FakeDb pattern. `actions.ts` ("use server") wraps this with the real
// `getDb()` + redirect.
//
// Story 5.0 scope: only `name` and `dateOfBirth` are editable. Email is
// read-only at MVP1 (change requires re-verification — defer to a future
// story). Password change links to the existing /signin/forgot flow.

import { eq, sql } from "drizzle-orm";
import { users } from "../../../lib/db/schema";

export type ProfileFlowResult =
  | { ok: true; updatedAt: Date }
  | { ok: false; fieldErrors: Partial<Record<"name" | "dateOfBirth", string>>; values: ProfileValues }
  | { ok: false; formError: string; values: ProfileValues };

export interface ProfileValues {
  name: string;
  dateOfBirth: string; // YYYY-MM-DD or ""
}

interface UpdateChain<TRow> {
  set(values: unknown): {
    where(condition: unknown): Promise<TRow[]> | { returning(cols: unknown): Promise<TRow[]> };
  };
}

export interface DbForProfileUpdate {
  update(table: unknown): UpdateChain<{ id: string }>;
}

export interface ProfileFlowDeps {
  db: DbForProfileUpdate;
  userId: string;
  now?: () => Date;
  logger?: { error: (message: string, err?: unknown) => void };
}

const NAME_MIN = 2;
const NAME_MAX = 100;

// Accepts YYYY-MM-DD shape only (matches HTML `<input type="date">` output).
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateProfileInput(values: ProfileValues): {
  ok: boolean;
  fieldErrors: Partial<Record<"name" | "dateOfBirth", string>>;
} {
  const fieldErrors: Partial<Record<"name" | "dateOfBirth", string>> = {};

  const trimmedName = values.name.trim();
  if (trimmedName.length < NAME_MIN) {
    fieldErrors.name = `שם חייב להכיל לפחות ${NAME_MIN} תווים.`;
  } else if (trimmedName.length > NAME_MAX) {
    fieldErrors.name = `שם ארוך מדי (עד ${NAME_MAX} תווים).`;
  }

  if (values.dateOfBirth.trim().length > 0) {
    if (!DATE_REGEX.test(values.dateOfBirth)) {
      fieldErrors.dateOfBirth = "תאריך לידה לא תקין.";
    } else {
      const parsed = new Date(`${values.dateOfBirth}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) {
        fieldErrors.dateOfBirth = "תאריך לידה לא תקין.";
      } else if (parsed.getTime() > Date.now()) {
        fieldErrors.dateOfBirth = "תאריך לידה חייב להיות בעבר.";
      }
    }
  }

  return { ok: Object.keys(fieldErrors).length === 0, fieldErrors };
}

export async function runUpdateProfile(
  formData: FormData,
  deps: ProfileFlowDeps,
): Promise<ProfileFlowResult> {
  const logger = deps.logger ?? { error: (msg, err) => console.error(msg, err) };
  const now = deps.now ?? (() => new Date());

  const values: ProfileValues = {
    name: String(formData.get("name") ?? "").trim(),
    dateOfBirth: String(formData.get("dateOfBirth") ?? "").trim(),
  };

  const validation = validateProfileInput(values);
  if (!validation.ok) {
    return { ok: false, fieldErrors: validation.fieldErrors, values };
  }

  try {
    const updatedAt = now();
    await deps.db
      .update(users)
      .set({
        name: values.name,
        dateOfBirth: values.dateOfBirth.length > 0 ? values.dateOfBirth : null,
        updatedAt: sql`now()`,
        updatedByKind: "user",
        updatedByActor: deps.userId,
      })
      .where(eq(users.id, deps.userId));

    return { ok: true, updatedAt };
  } catch (err) {
    logger.error("[runUpdateProfile] DB update failed", err);
    return {
      ok: false,
      formError: "אירעה שגיאה בשמירה. נסו שוב בעוד דקה.",
      values,
    };
  }
}
