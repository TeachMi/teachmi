import type { DefaultSession } from "next-auth";
import type { AppRole } from "@/lib/auth/roles";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
      /**
       * Account-level profile photo R2 key. Resolved to a presigned GET URL
       * at the consumer (e.g. SiteHeader, /account/profile). Distinct from
       * `user.image` which Auth.js populates from OAuth providers (Google
       * profile picture URL) — `profilePhotoR2Key` takes precedence when both
       * are set.
       */
      profilePhotoR2Key?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role?: AppRole | null;
    profilePhotoR2Key?: string | null;
  }
}
