import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { auditEvents, sessions, users, verificationTokens } from "@/lib/db/schema";
import { toAuditEventValues } from "@/lib/db/audit";
import { evaluateTokenValidity } from "@/lib/auth/email-verification";
import { isAppRole, type AppRole } from "@/lib/auth/roles";
import { track } from "@/lib/analytics";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

function redirectToError(reason: string, request: NextRequest): NextResponse {
  return NextResponse.redirect(
    new URL(`/signup/verify-error?reason=${reason}`, request.nextUrl),
    303,
  );
}

type VerifyOutcome =
  | { kind: "ok"; sessionToken: string; expires: Date; userId: string; role: AppRole }
  | { kind: "expired" }
  | { kind: "not_found" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return redirectToError("missing", request);
  }

  const db = getDb();
  let outcome: VerifyOutcome;

  try {
    // Sequential queries (Neon HTTP driver has no interactive transactions).
    // Order: look up → consume (delete) → evaluate → update user → audit → create session.
    const matched = await db
      .select({
        identifier: verificationTokens.identifier,
        expires: verificationTokens.expires,
      })
      .from(verificationTokens)
      .where(eq(verificationTokens.token, token));

    const row = matched[0] ?? null;

    if (row) {
      await db
        .delete(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, row.identifier),
            eq(verificationTokens.token, token),
          ),
        );
    }

    const validity = evaluateTokenValidity(row);
    if (!validity.valid) {
      outcome = { kind: validity.reason };
    } else {
      const updated = await db
        .update(users)
        .set({
          emailVerified: sql`now()`,
          updatedAt: sql`now()`,
          updatedByKind: "system",
          updatedByActor: "email-verification",
        })
        .where(eq(users.email, validity.identifier))
        .returning({ id: users.id, role: users.role });

      const userRow = updated[0];
      if (!userRow) {
        throw new Error(
          `verify-email: token matched identifier ${validity.identifier} but user row not found`,
        );
      }

      const role: AppRole = isAppRole(userRow.role) ? userRow.role : "student";

      await db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "auth.email_verified",
          actorKind: "user",
          actorId: userRow.id,
          targetType: "user",
          targetId: userRow.id,
          payload: {},
        }),
      );

      const sessionToken = randomUUID();
      const expires = new Date(Date.now() + SESSION_TTL_MS);

      await db.insert(sessions).values({
        sessionToken,
        userId: userRow.id,
        expires,
      });

      outcome = {
        kind: "ok",
        sessionToken,
        expires,
        userId: userRow.id,
        role,
      };
    }
  } catch (err) {
    console.error("[verify-route] DB write failed", err);
    return redirectToError("internal", request);
  }

  if (outcome.kind === "not_found") {
    return redirectToError("not_found", request);
  }
  if (outcome.kind === "expired") {
    return redirectToError("expired", request);
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: getSessionCookieName(),
    value: outcome.sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: outcome.expires,
  });

  track({ event: "email_verified", userId: outcome.userId, role: outcome.role });

  return NextResponse.redirect(new URL("/dashboard", request.nextUrl), 303);
}
