import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import type { Adapter } from "next-auth/adapters";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "../db/client";
import { accounts, sessions, users, verificationTokens } from "../db/schema";
import { defaultPostSignInPath, getSafeCallbackUrl } from "./callback-url";
import { isAppRole } from "./roles";

let authAdapter: Adapter | null = null;

const GOOGLE_OAUTH_CLIENT_ID =
  "746211293759-f6dclsj323op2buvfnqfffvu97jmklmq.apps.googleusercontent.com";

function readGoogleClientId(): string {
  return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || GOOGLE_OAUTH_CLIENT_ID;
}

function readGoogleClientSecret(): string | undefined {
  return process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || undefined;
}

function isGoogleEmailVerified(profile: unknown): boolean {
  return (
    typeof profile === "object" &&
    profile !== null &&
    "email_verified" in profile &&
    (profile as { email_verified?: unknown }).email_verified === true
  );
}

export function getAuthAdapter(): Adapter {
  if (!authAdapter) {
    authAdapter = DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    } as never);
  }

  return authAdapter;
}

function getUserRole(user: unknown) {
  if (typeof user !== "object" || user === null || !("role" in user)) {
    return "student";
  }

  const role = (user as { role?: unknown }).role;
  return isAppRole(role) ? role : "student";
}

export function createAuthConfig(): NextAuthConfig {
  return {
    adapter: getAuthAdapter(),
    // Email + password sign-in does NOT use the Auth.js Credentials provider —
    // Auth.js v5 hardcodes a JWT cookie for Credentials regardless of
    // session.strategy (see @auth/core/lib/actions/callback/index.js:247-274
    // and @auth/core/providers/credentials.d.ts:74-75). Going through the
    // provider would break session-shape parity with the verify Route Handler
    // (Story 1.13) which inserts a `sessions` row + sets a UUID-token cookie.
    // The Server Action at src/app/signin/actions.ts does the same direct
    // INSERT + cookie set; Auth.js only handles Google OAuth here.
    providers: [
      Google({
        clientId: readGoogleClientId(),
        clientSecret: readGoogleClientSecret(),
        // Google reports `email_verified`; our signIn callback rejects any
        // unverified Google profile before Auth.js reaches auto-linking.
        allowDangerousEmailAccountLinking: true,
      }),
    ],
    session: {
      strategy: "database",
    },
    pages: {
      signIn: "/signin",
    },
    trustHost: true,
    useSecureCookies: process.env.NODE_ENV === "production",
    callbacks: {
      signIn({ account, profile }) {
        if (account?.provider !== "google") {
          return true;
        }

        return isGoogleEmailVerified(profile);
      },
      session({ session, user }) {
        if (session.user) {
          session.user.id = user.id;
          session.user.role = getUserRole(user);
          // Surface the R2 key (not a URL) on the session so consumers
          // (SiteHeader avatar, /account/profile) can resolve to a fresh
          // presigned GET URL each render. Distinct from `user.image`
          // which Auth.js populates from OAuth provider profile URLs.
          const photoKey = (user as { profilePhotoR2Key?: string | null })
            .profilePhotoR2Key;
          session.user.profilePhotoR2Key =
            typeof photoKey === "string" && photoKey.length > 0 ? photoKey : null;
        }

        return session;
      },
      redirect({ url, baseUrl }) {
        if (url.startsWith("/")) {
          return `${baseUrl}${getSafeCallbackUrl(url)}`;
        }

        try {
          const parsedUrl = new URL(url);
          if (parsedUrl.origin === baseUrl) {
            return parsedUrl.toString();
          }
        } catch {
          return `${baseUrl}${defaultPostSignInPath}`;
        }

        return `${baseUrl}${defaultPostSignInPath}`;
      },
    },
    events: {
      async linkAccount({ user, account, profile }) {
        if (
          account.provider !== "google" ||
          !isGoogleEmailVerified(profile) ||
          typeof user.id !== "string"
        ) {
          return;
        }

        const now = new Date();
        await getDb()
          .update(users)
          .set({
            emailVerified: now,
            updatedAt: now,
            updatedByKind: "system",
            updatedByActor: "google-oauth",
          })
          .where(eq(users.id, user.id));
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => createAuthConfig());
