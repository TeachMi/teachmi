import { and, eq } from "drizzle-orm";
import { toAuditEventValues } from "../db/audit";
import { getDb } from "../db/client";
import { auditEvents, users } from "../db/schema";

export interface DependentFormValues {
  name: string;
  dateOfBirth: string;
}

export type DependentValidationResult =
  | { ok: true; values: DependentFormValues }
  | {
      ok: false;
      fieldErrors: Partial<Record<keyof DependentFormValues, string>>;
    };

export function ageInYears(dateOfBirth: string, today: Date = new Date()): number {
  const birth = parseIsoDateOnly(dateOfBirth);
  if (!birth) return Number.NaN;

  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birth.getUTCMonth();
  const dayDelta = today.getUTCDate() - birth.getUTCDate();
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }
  return age;
}

export function validateDependentInput(
  formData: FormData,
  today: Date = new Date(),
): DependentValidationResult {
  const name = String(formData.get("name") ?? "").trim();
  const dateOfBirth = String(formData.get("dateOfBirth") ?? "").trim();
  const fieldErrors: Partial<Record<keyof DependentFormValues, string>> = {};

  if (name.length < 2) {
    fieldErrors.name = "יש להזין שם מלא.";
  }

  const parsedBirthDate = parseIsoDateOnly(dateOfBirth);
  if (!parsedBirthDate) {
    fieldErrors.dateOfBirth = "יש להזין תאריך לידה תקין.";
  } else if (parsedBirthDate > stripTimeUtc(today)) {
    fieldErrors.dateOfBirth = "תאריך הלידה לא יכול להיות בעתיד.";
  } else if (ageInYears(dateOfBirth, today) >= 18) {
    fieldErrors.dateOfBirth = "אפשר להוסיף כאן רק תלמידים מתחת לגיל 18.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return { ok: true, values: { name, dateOfBirth } };
}

export interface CreateDependentInput extends DependentFormValues {
  parentUserId: string;
}

export async function createDependentStudent(input: CreateDependentInput) {
  const db = getDb();
  const inserted = await db
    .insert(users)
    .values({
      name: input.name,
      email: null,
      passwordHash: null,
      role: "student",
      parentUserId: input.parentUserId,
      dateOfBirth: input.dateOfBirth,
      locale: "he-IL",
      timezone: "Asia/Jerusalem",
      createdByKind: "user",
      createdByActor: input.parentUserId,
    })
    .returning({ id: users.id });

  const dependent = inserted[0];
  if (!dependent) {
    throw new Error("Dependent insert returned no row.");
  }

  await db.insert(auditEvents).values(
    toAuditEventValues({
      eventType: "account.dependent_created",
      actorKind: "user",
      actorId: input.parentUserId,
      targetType: "user",
      targetId: dependent.id,
      payload: { role: "student", hasOwnSignIn: false },
    }),
  );

  return dependent;
}

export async function listDependentsForParent(parentUserId: string) {
  const db = getDb();
  return db
    .select({
      id: users.id,
      name: users.name,
      dateOfBirth: users.dateOfBirth,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.parentUserId, parentUserId), eq(users.role, "student")));
}

function parseIsoDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== value) return null;
  return parsed;
}

function stripTimeUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
