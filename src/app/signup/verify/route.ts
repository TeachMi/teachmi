import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { track } from "@/lib/analytics";
import { runVerify } from "../verify-flow";

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");

  const result = await runVerify(token, {
    db: getDb() as unknown as Parameters<typeof runVerify>[1]["db"],
    generateSessionToken: () => randomUUID(),
    track,
  });

  if (result.kind === "error") {
    return redirectToError(result.reason, request);
  }

  if (result.kind === "verified_no_session") {
    // User is verified but session creation failed (pool exhaustion, etc.).
    // Redirect to signin with a banner indicating they should sign in manually.
    return NextResponse.redirect(
      new URL("/signin?verified=1", request.nextUrl),
      303,
    );
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: getSessionCookieName(),
    value: result.sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: result.expires,
  });

  return NextResponse.redirect(new URL("/dashboard", request.nextUrl), 303);
}
