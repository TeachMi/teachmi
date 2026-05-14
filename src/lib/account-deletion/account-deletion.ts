import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { toAuditEventValues } from "../db/audit";
import { getDb } from "../db/client";
import {
  accountDeletionSnapshots,
  auditEvents,
  sessions,
  tutorProfiles,
  users,
} from "../db/schema";

export const ACCOUNT_RESTORE_TOKEN_TTL_DAYS = 30;

export function generateRestoreToken(): string {
  return randomBytes(32).toString("base64url");
}

export function restoreTokenExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + ACCOUNT_RESTORE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function tombstoneEmail(userId: string): string {
  return `deleted_${userId}@teachme.invalid`;
}

export function buildRestoreUrl(token: string, origin: string): string {
  return `${origin}/account/restore/${encodeURIComponent(token)}`;
}

export function validateDeleteConfirmation(input: {
  confirmation: string;
  email: string | null | undefined;
}) {
  const email = input.email?.trim().toLowerCase();
  if (!email) {
    return { ok: false as const, error: "לא ניתן למחוק חשבון בלי כתובת אימייל." };
  }
  if (input.confirmation.trim().toLowerCase() !== email) {
    return { ok: false as const, error: "כתובת האימייל אינה תואמת לחשבון." };
  }
  return { ok: true as const, email };
}

export interface SoftDeleteAccountInput {
  userId: string;
  origin: string;
  now?: Date;
}

export async function softDeleteAccount(input: SoftDeleteAccountInput) {
  const db = getDb();
  const now = input.now ?? new Date();
  const restoreToken = generateRestoreToken();
  const expiresAt = restoreTokenExpiresAt(now);

  const existingUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      dateOfBirth: users.dateOfBirth,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, input.userId));
  const user = existingUsers[0];
  if (!user || user.deletedAt !== null) {
    throw new Error("Cannot delete missing or already-deleted account.");
  }

  const tutorRows = await db
    .select({ deletedAt: tutorProfiles.deletedAt })
    .from(tutorProfiles)
    .where(eq(tutorProfiles.userId, input.userId));

  await db
    .delete(accountDeletionSnapshots)
    .where(eq(accountDeletionSnapshots.userId, input.userId));

  await db.insert(accountDeletionSnapshots).values({
    userId: input.userId,
    restoreToken,
    restoreTokenExpiresAt: expiresAt,
    email: user.email,
    name: user.name,
    image: user.image,
    dateOfBirth: user.dateOfBirth,
    tutorProfileDeletedAt: tutorRows[0]?.deletedAt ?? null,
    createdByKind: "user",
    createdByActor: input.userId,
  });

  await db
    .update(users)
    .set({
      email: tombstoneEmail(input.userId),
      name: "[deleted]",
      image: null,
      dateOfBirth: null,
      deletedAt: now,
      updatedAt: now,
      updatedByKind: "user",
      updatedByActor: input.userId,
    })
    .where(eq(users.id, input.userId));

  await db
    .update(tutorProfiles)
    .set({
      deletedAt: now,
      updatedAt: now,
      updatedByKind: "user",
      updatedByActor: input.userId,
    })
    .where(eq(tutorProfiles.userId, input.userId));

  await db.delete(sessions).where(eq(sessions.userId, input.userId));

  await db.insert(auditEvents).values(
    toAuditEventValues({
      eventType: "account.soft_deleted",
      actorKind: "user",
      actorId: input.userId,
      targetType: "user",
      targetId: input.userId,
      payload: { restoreTokenExpiresAt: expiresAt.toISOString() },
    }),
  );

  return {
    restoreToken,
    expiresAt,
    restoreUrl: buildRestoreUrl(restoreToken, input.origin),
  };
}

export async function restoreSoftDeletedAccount(token: string, now: Date = new Date()) {
  const db = getDb();
  const snapshots = await db
    .select()
    .from(accountDeletionSnapshots)
    .where(
      and(
        eq(accountDeletionSnapshots.restoreToken, token),
        gt(accountDeletionSnapshots.restoreTokenExpiresAt, now),
      ),
    );
  const snapshot = snapshots[0];
  if (!snapshot) {
    return { ok: false as const, reason: "invalid_or_expired" as const };
  }

  await db
    .update(users)
    .set({
      email: snapshot.email,
      name: snapshot.name,
      image: snapshot.image,
      dateOfBirth: snapshot.dateOfBirth,
      deletedAt: null,
      updatedAt: now,
      updatedByKind: "user",
      updatedByActor: snapshot.userId,
    })
    .where(eq(users.id, snapshot.userId));

  await db
    .update(tutorProfiles)
    .set({
      deletedAt: snapshot.tutorProfileDeletedAt,
      updatedAt: now,
      updatedByKind: "user",
      updatedByActor: snapshot.userId,
    })
    .where(eq(tutorProfiles.userId, snapshot.userId));

  await db.delete(sessions).where(eq(sessions.userId, snapshot.userId));
  await db
    .delete(accountDeletionSnapshots)
    .where(eq(accountDeletionSnapshots.id, snapshot.id));

  await db.insert(auditEvents).values(
    toAuditEventValues({
      eventType: "account.restored",
      actorKind: "user",
      actorId: snapshot.userId,
      targetType: "user",
      targetId: snapshot.userId,
      payload: { restoredFromSnapshot: true },
    }),
  );

  return { ok: true as const, userId: snapshot.userId };
}
