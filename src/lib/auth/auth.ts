import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Adapter } from "next-auth/adapters";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { getDb } from "../db/client";
import { accounts, sessions, users, verificationTokens } from "../db/schema";
import { defaultPostSignInPath, getSafeCallbackUrl } from "./callback-url";
import { isAppRole } from "./roles";
import { authorizeWithCredentials } from "./credentials-authorize";
import { verifyPassword } from "./password-hashing";

let authAdapter: Adapter | null = null;

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
    providers: [
      Google,
      Credentials({
        // The provider name (used as the first arg to `signIn("credentials", ...)`).
        name: "credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(input) {
          const email = typeof input?.email === "string" ? input.email : "";
          const password = typeof input?.password === "string" ? input.password : "";
          return authorizeWithCredentials(
            { email, password },
            {
              db: getDb() as unknown as Parameters<
                typeof authorizeWithCredentials
              >[1]["db"],
              verifyPassword,
            },
          );
        },
      }),
    ],
    session: {
      // Database sessions are LOAD-BEARING for the Credentials provider —
      // switching to "jwt" would skip the adapter's `createSession` and
      // produce a JWT cookie instead, diverging from the verify Route Handler
      // (Story 1.13) that inserts directly into the `sessions` table. Both
      // paths must produce structurally identical rows + cookies.
      strategy: "database",
    },
    pages: {
      signIn: "/signin",
    },
    trustHost: true,
    useSecureCookies: process.env.NODE_ENV === "production",
    callbacks: {
      session({ session, user }) {
        if (session.user) {
          session.user.id = user.id;
          session.user.role = getUserRole(user);
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
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => createAuthConfig());
