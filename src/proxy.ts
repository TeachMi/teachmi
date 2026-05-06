import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getSafeCallbackUrl } from "@/lib/auth/callback-url";

export default auth((request) => {
  if (request.auth?.user) {
    return NextResponse.next();
  }

  const callbackUrl = getSafeCallbackUrl(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  const signInUrl = new URL("/signin", request.nextUrl);
  signInUrl.searchParams.set("callbackUrl", callbackUrl);

  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
