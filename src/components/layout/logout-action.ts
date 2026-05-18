"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth/auth";

// Server Action that backs the "התנתקות" button at the bottom of the
// tutor self-service surface (`/tutor/me/layout.tsx`).
//
// Why this is a two-step (`signOut({ redirect: false })` + `redirect("/")`)
// rather than NextAuth's one-call `signOut({ redirectTo: "/" })`:
// NextAuth v5 resolves a relative `redirectTo` against the `AUTH_URL` env
// var. Our `.env` pins `AUTH_URL=http://localhost:3000` (the canonical dev
// port) so when the dev server runs on a different port (3500 for the
// Story 2.10 work tree, etc.), the one-call form bounces the browser to
// port 3000 instead of the current origin.
//
// `signOut({ redirect: false })` clears the session cookie via the
// Server-Action `cookies()` side-effect without doing any redirect. We
// then call Next's `redirect("/")` which is ALWAYS resolved against the
// current request origin — so logout returns the user to the homepage on
// whichever host:port served the request.
//
// History: this lived briefly as `avatar-menu-actions.ts` when logout was
// wired into a Radix DropdownMenu under the avatar. Founder direction
// 2026-05-17 reverted that pattern — avatar is a direct link, logout lives
// at the bottom of /tutor/me — so the file is named for what it does.
export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false });
  redirect("/");
}
