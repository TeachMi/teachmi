import { legalDocuments } from "../../lib/legal/documents";

export interface NavigationLink {
  href: string;
  label: string;
  /**
   * Auth-state gate for the top nav. `anonymous` shows only to signed-out
   * visitors; `authenticated` only to signed-in users; omitted = always shown.
   */
  visibility?: "anonymous" | "authenticated";
}

export const primaryNavItems = [
  { href: "/", label: "בית" },
  { href: "/browse", label: "חיפוש מורים" },
  { href: "/become-a-tutor", label: "הצטרפו כמורים", visibility: "anonymous" },
  { href: "/dashboard", label: "השיעורים שלי", visibility: "authenticated" },
  { href: "/help", label: "עזרה" },
] satisfies NavigationLink[];

/** Filters `primaryNavItems` by the viewer's auth state (see `NavigationLink.visibility`). */
export function getPrimaryNavItems(isAuthenticated: boolean): NavigationLink[] {
  return primaryNavItems.filter((item) => {
    if (item.visibility === "authenticated") return isAuthenticated;
    if (item.visibility === "anonymous") return !isAuthenticated;
    return true;
  });
}

export const legalLinks: NavigationLink[] = legalDocuments.map((doc) => ({
  href: doc.href,
  label: doc.footerLabel,
}));

// Story 2.10 amendment 2026-05-16: where does the top-right avatar link to?
// Role-aware — each role has its own "my home" surface:
//   admin   → /admin               (admin landing, Story 1.20)
//   tutor   → /tutor/me            (tutor self-service tab shell, Story 2.10)
//   student → /account/profile     (student account settings, Story 5.0)
//
// Deliberately NOT routed via /dashboard. /dashboard and "my account" are
// different concepts: dashboard = activity hub (lessons, upcoming), my-home
// = identity/settings. They coincidentally share a destination for tutors
// today (because /tutor/me happens to host both), but that's a coincidence,
// not a coupling we want to bake in.
//
// Single-role enum at MVP1; FR5 (dual-role) is Phase 2+. When dual-role
// ships, the caller will need to disambiguate via a "currently-acting-as"
// session field — this helper's contract becomes "role → href" still, but
// the role argument shifts from the static `users.role` column to a
// dynamic active-role.
export type AccountRole = "admin" | "tutor" | "student";

export interface AccountHomeLink {
  href: string;
  /** aria-label for the avatar link wrapping. */
  ariaLabel: string;
}

export function getAccountHomeHref(role: AccountRole | null | undefined): AccountHomeLink {
  switch (role) {
    case "admin":
      return { href: "/admin", ariaLabel: "אזור ניהול" };
    case "tutor":
      return { href: "/tutor/me", ariaLabel: "אזור המורה" };
    case "student":
    default:
      return { href: "/account/profile", ariaLabel: "החשבון שלי" };
  }
}
