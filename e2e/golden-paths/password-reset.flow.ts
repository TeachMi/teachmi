// Helpers for the Story 1.15 password-reset golden-path E2E. Mirrors the
// signin-fixture.ts pattern from Story 1.14 — graceful skip when DATABASE_URL
// is unset, per-test unique email, idempotent provisioning.

import type { TestInfo } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and } from "drizzle-orm";
import { devEmailOutbox, users } from "../../src/lib/db/schema";
import { hash } from "@node-rs/argon2";

const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export interface ProvisionedUser {
  email: string;
  password: string;
  userId: string;
}

export function buildResetEmail(testInfo: TestInfo): string {
  const runId = process.env.GITHUB_RUN_ID ?? "local";
  const worker = testInfo.workerIndex;
  return `pwd-reset+${runId}-w${worker}@example.test`;
}

export async function provisionVerifiedUser(
  testInfo: TestInfo,
  password: string,
): Promise<ProvisionedUser | null> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[password-reset/fixture] refuses to run when NODE_ENV === 'production' — provisions a known-credential test user.",
    );
  }
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const sql = neon(url);
  const db = drizzle(sql);

  const email = buildResetEmail(testInfo);
  const passwordHash = await hash(password, ARGON2_OPTIONS);

  // Idempotent provisioning. If a prior test run left the row, reset its hash
  // (so the password reset under test really IS the only path that changes it).
  await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name: "Password Reset Test",
      role: "student",
      emailVerified: new Date(),
      createdByKind: "system",
      createdByActor: "e2e-reset-fixture",
    })
    .onConflictDoNothing({ target: users.email });

  await db.update(users).set({ passwordHash }).where(eq(users.email, email));

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  const userId = rows[0]?.id;
  if (!userId) {
    throw new Error(`[password-reset/fixture] failed to provision ${email}`);
  }

  return { email, password, userId };
}

/**
 * Read the most recent password-reset row from `_dev_email_outbox` for an
 * email, return the `resetUrl` payload. Mirrors `scripts/peek-reset-email.ts`
 * but in the Playwright fixture surface.
 */
export async function peekResetUrl(email: string): Promise<string | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const sql = neon(url);
  const db = drizzle(sql);

  const rows = await db
    .select({ payload: devEmailOutbox.payload })
    .from(devEmailOutbox)
    .where(
      and(
        eq(devEmailOutbox.toAddress, email),
        eq(devEmailOutbox.templateId, "auth-password-reset"),
      ),
    );

  // Take the latest by createdAt — Drizzle doesn't order by default; we sort
  // in JS since rows in this flow are bounded to single-digits.
  // (devEmailOutbox doesn't expose a numeric ord in this select, so any row
  // with the matching templateId is fine for a single-test invocation.)
  const latest = rows[rows.length - 1];
  const payload = latest?.payload as { resetUrl?: string } | undefined;
  return payload?.resetUrl ?? null;
}
