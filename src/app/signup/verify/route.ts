import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { track } from "@/lib/analytics";
import { runVerify } from "../verify-flow";
import { resolveVerifyRedirect } from "./route-resolve";

function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  const rawNext = request.nextUrl.searchParams.get("next");

  const result = await runVerify(token, {
    db: getDb() as unknown as Parameters<typeof runVerify>[1]["db"],
    generateSessionToken: () => randomUUID(),
    track,
  });

  const resolved = resolveVerifyRedirect(result, rawNext);

  if (resolved.setSessionCookie && result.kind === "ok") {
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

    if (resolved.completionTutorUserId) {
      track({
        event: "signup_intent_book_completed",
        userId: result.userId,
        tutorUserId: resolved.completionTutorUserId,
      });
    }
  }

  return NextResponse.redirect(new URL(resolved.path, request.nextUrl), 303);
}
