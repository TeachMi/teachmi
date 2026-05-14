import { randomBytes } from "node:crypto";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
} from "drizzle-orm";
import { track } from "../analytics";
import { toAuditEventValues } from "../db/audit";
import { getDb } from "../db/client";
import {
  auditEvents,
  bookings,
  consentReceipts,
  dataExportTokens,
  disputeMessages,
  disputes,
  lessonSessions,
  notificationPreferences,
  ratings,
  studentLessonNotes,
  studentSettings,
  tutorProfiles,
  tutorStudentNotes,
  users,
} from "../db/schema";

export const DATA_EXPORT_TOKEN_TTL_HOURS = 24;

export function generateDataExportToken(): string {
  return randomBytes(32).toString("base64url");
}

export function dataExportExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + DATA_EXPORT_TOKEN_TTL_HOURS * 60 * 60 * 1000);
}

export function buildDataExportUrl(token: string, origin: string): string {
  return `${origin}/api/data-export/${encodeURIComponent(token)}`;
}

export function dataExportFilename(userId: string): string {
  return `teachme-data-export-${userId}.json`;
}

export interface CreateDataExportTokenInput {
  userId: string;
  now?: Date;
}

export async function createDataExportToken(input: CreateDataExportTokenInput) {
  const token = generateDataExportToken();
  const expiresAt = dataExportExpiresAt(input.now);
  const db = getDb();

  await db.insert(dataExportTokens).values({
    userId: input.userId,
    token,
    expiresAt,
    createdByKind: "user",
    createdByActor: input.userId,
  });

  await db.insert(auditEvents).values(
    toAuditEventValues({
      eventType: "privacy.data_export_requested",
      actorKind: "user",
      actorId: input.userId,
      targetType: "user",
      targetId: input.userId,
      payload: { expiresAt: expiresAt.toISOString() },
    }),
  );

  return { token, expiresAt };
}

export type ConsumeDataExportTokenResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid_or_expired" };

export async function consumeDataExportToken(
  token: string,
  now: Date = new Date(),
): Promise<ConsumeDataExportTokenResult> {
  const db = getDb();
  const rows = await db
    .update(dataExportTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(dataExportTokens.token, token),
        isNull(dataExportTokens.consumedAt),
        gt(dataExportTokens.expiresAt, now),
      ),
    )
    .returning({ userId: dataExportTokens.userId });

  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid_or_expired" };

  return { ok: true, userId: row.userId };
}

export interface PersonalDataExport {
  exportedAt: string;
  userId: string;
  profile: unknown[];
  studentSettings: unknown[];
  tutorProfile: unknown[];
  notificationPreferences: unknown[];
  consentReceipts: unknown[];
  bookings: unknown[];
  lessonSessions: unknown[];
  ownPrivateNotes: {
    studentLessonNotes: unknown[];
    tutorStudentNotes: unknown[];
  };
  ratings: {
    given: unknown[];
    received: unknown[];
  };
  disputes: {
    filed: unknown[];
    messagesAuthored: unknown[];
  };
  auditEvents: unknown[];
}

export async function buildPersonalDataExport(
  userId: string,
  now: Date = new Date(),
): Promise<PersonalDataExport> {
  const db = getDb();
  const bookingRows = await db
    .select()
    .from(bookings)
    .where(or(eq(bookings.studentUserId, userId), eq(bookings.tutorUserId, userId)))
    .orderBy(desc(bookings.startsAt));
  const bookingIds = bookingRows.map((booking) => booking.id);

  const lessonRows =
    bookingIds.length === 0
      ? []
      : await db
          .select()
          .from(lessonSessions)
          .where(inArray(lessonSessions.bookingId, bookingIds));

  const [
    profile,
    settingsRows,
    tutorProfileRows,
    notificationPreferenceRows,
    consentRows,
    studentNoteRows,
    tutorNoteRows,
    ratingsGiven,
    ratingsReceived,
    filedDisputes,
    authoredDisputeMessages,
    relevantAuditEvents,
  ] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        image: users.image,
        role: users.role,
        parentUserId: users.parentUserId,
        locale: users.locale,
        timezone: users.timezone,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId)),
    db.select().from(studentSettings).where(eq(studentSettings.userId, userId)),
    db.select().from(tutorProfiles).where(eq(tutorProfiles.userId, userId)),
    db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId)),
    db
      .select()
      .from(consentReceipts)
      .where(eq(consentReceipts.userId, userId))
      .orderBy(desc(consentReceipts.acceptedAt)),
    db
      .select()
      .from(studentLessonNotes)
      .where(eq(studentLessonNotes.studentUserId, userId))
      .orderBy(desc(studentLessonNotes.createdAt)),
    db
      .select()
      .from(tutorStudentNotes)
      .where(eq(tutorStudentNotes.tutorUserId, userId))
      .orderBy(desc(tutorStudentNotes.createdAt)),
    db.select().from(ratings).where(eq(ratings.studentUserId, userId)),
    db.select().from(ratings).where(eq(ratings.tutorUserId, userId)),
    db
      .select()
      .from(disputes)
      .where(eq(disputes.filedByUserId, userId))
      .orderBy(desc(disputes.createdAt)),
    db
      .select()
      .from(disputeMessages)
      .where(eq(disputeMessages.authorUserId, userId))
      .orderBy(desc(disputeMessages.createdAt)),
    db
      .select()
      .from(auditEvents)
      .where(or(eq(auditEvents.actorId, userId), eq(auditEvents.targetId, userId)))
      .orderBy(desc(auditEvents.createdAt)),
  ]);

  return {
    exportedAt: now.toISOString(),
    userId,
    profile,
    studentSettings: settingsRows,
    tutorProfile: tutorProfileRows,
    notificationPreferences: notificationPreferenceRows,
    consentReceipts: consentRows,
    bookings: bookingRows,
    lessonSessions: lessonRows,
    ownPrivateNotes: {
      studentLessonNotes: studentNoteRows,
      tutorStudentNotes: tutorNoteRows,
    },
    ratings: {
      given: ratingsGiven,
      received: ratingsReceived,
    },
    disputes: {
      filed: filedDisputes,
      messagesAuthored: authoredDisputeMessages,
    },
    auditEvents: relevantAuditEvents,
  };
}

export async function consumeTokenAndBuildExport(token: string) {
  const consumed = await consumeDataExportToken(token);
  if (!consumed.ok) return consumed;

  const body = await buildPersonalDataExport(consumed.userId);
  track({ event: "data_export_downloaded", userId: consumed.userId });
  return { ok: true as const, userId: consumed.userId, body };
}
