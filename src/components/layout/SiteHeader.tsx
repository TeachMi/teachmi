import Link from "next/link";
import { cache, type ReactNode } from "react";
import { auth } from "@/lib/auth/auth";
import { Avatar } from "@/components/ui/avatar";
import { resolveProfilePhotoUrl } from "@/app/account/profile/upload-actions";
import { getTutorProfileForOwner } from "@/lib/db/queries/tutor-queries";
import { getFilesProvider, isStubUrl } from "@/lib/providers/files";
import { getAccountHomeHref, getPrimaryNavItems, type AccountRole } from "./navigation";

const HEADER_PHOTO_URL_TTL_SEC = 600;

// Per-request memoization. The /tutor/me surface invokes both <SiteHeader>
// (via root layout) and `requireTutor` (in the tutor layout/page) which can
// independently call `getTutorProfileForOwner` for the same user-id within
// one request. React's `cache()` de-dupes those reads at the RSC level.
const getTutorProfileForOwnerCached = cache(getTutorProfileForOwner);

// Tutor photos live in a different bucket than student account photos:
//   - student: `users.profile_photo_r2_key` → `student-profile-photos` bucket
//   - tutor:   `tutor_profiles.profile_photo_r2_key` → `tutor-profile-photos` bucket
// The SiteHeader avatar resolves to the right column + bucket per role. For
// closed-beta, tutors don't have a separate /account/profile photo — their
// tutor profile photo IS their account photo. (Schema comments in
// src/lib/db/schema.ts capture the two-column model.)
async function resolveTutorAvatarUrl(tutorUserId: string): Promise<string | null> {
  try {
    const profile = await getTutorProfileForOwnerCached(tutorUserId);
    if (!profile?.profilePhotoR2Key) return null;
    const url = await getFilesProvider().generatePresignedGetUrl({
      bucket: "tutor-profile-photos",
      key: profile.profilePhotoR2Key,
      expiresInSec: HEADER_PHOTO_URL_TTL_SEC,
    });
    return isStubUrl(url) ? null : url;
  } catch (err) {
    console.error("[SiteHeader] tutor avatar resolve failed", err);
    return null;
  }
}

interface SiteHeaderProps {
  activeHref?: string;
  /**
   * Override slot for page-specific header actions (e.g. dismiss buttons,
   * step-back chrome). When omitted, the header renders:
   *   - signed-in users → an avatar linking to /account/profile
   *   - anonymous users → a "כניסה" link to /signin
   */
  action?: ReactNode;
}

// Auth read is wrapped because `auth()` lazily initializes the Drizzle adapter
// which calls `getDb()` — that throws when DATABASE_URL is unset (CI E2E
// runner). The header is shared chrome; a Neon outage shouldn't 500 every
// page. Same precedent as src/app/signup/page.tsx.
async function tryReadSession() {
  try {
    return await auth();
  } catch {
    return null;
  }
}

function deriveAvatarName(user: { name?: string | null; email?: string | null }): string {
  if (user.name && user.name.trim().length > 0) return user.name;
  if (user.email && user.email.length > 0) {
    return user.email.split("@")[0] ?? "User";
  }
  return "User";
}

export async function SiteHeader({ activeHref = "/", action }: SiteHeaderProps) {
  const session = await tryReadSession();
  const user = session?.user;
  const navItems = getPrimaryNavItems(Boolean(user));

  // Resolve the avatar's image source. Priority:
  //   1. Role-aware photo from the right R2 bucket:
  //       - tutor → tutor_profiles.profile_photo_r2_key + tutor-profile-photos
  //       - student/admin/default → users.profile_photo_r2_key + student-profile-photos
  //   2. Auth.js `user.image` (OAuth provider URL — Google profile picture).
  //   3. Avatar falls back to initials.
  let profilePhotoUrl: string | null = null;
  if (user) {
    if (user.role === "tutor") {
      profilePhotoUrl = await resolveTutorAvatarUrl(user.id);
    } else {
      profilePhotoUrl = await resolveProfilePhotoUrl(user.profilePhotoR2Key ?? null);
    }
  }
  const avatarSrc = profilePhotoUrl ?? user?.image ?? undefined;

  // Role-aware avatar link. Story 2.10 amendment 2026-05-16: tutor avatar
  // goes to /tutor/me, admin to /admin, student stays at /account/profile.
  // /account/profile is a STUDENT-ONLY surface — tutors landing there was a
  // bug. See `getAccountHomeHref` in ./navigation.ts for the rationale.
  const accountHome = getAccountHomeHref(
    (user?.role as AccountRole | undefined) ?? null,
  );

  // Founder direction 2026-05-17: the avatar is a direct link, NOT a
  // dropdown. Logout lives at the bottom of /tutor/me (and analogous
  // surfaces for student/admin), so the header avatar can stay a
  // one-click affordance.
  const defaultAction = user ? (
    <Link
      href={accountHome.href}
      aria-label={accountHome.ariaLabel}
      className="flex items-center rounded-full transition hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-accent"
    >
      <Avatar
        size="md"
        name={deriveAvatarName(user)}
        src={avatarSrc}
        className="bg-primary-container text-on-primary"
      />
    </Link>
  ) : (
    <Link
      className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-container px-5 text-sm font-bold text-on-primary shadow-sm transition hover:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-accent"
      href="/signin"
    >
      כניסה
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-linen-border bg-linen/95 backdrop-blur-md">
      {/* `flex-row-reverse` matches the mock convention: in RTL it places
          the logo block at the LEFT edge and the action cluster at the
          RIGHT edge (mock landing.html line 71). The inner nav keeps
          default flex-row so Hebrew reading order (בית → עזרה, right to
          left) is preserved. */}
      <div className="mx-auto flex w-full max-w-7xl flex-row-reverse flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link className="group flex items-center gap-2" href="/" aria-label="TeachMe דף הבית">
          {/* Material Symbol `school` — see prior comment + Story 3.1 fix
              loading the font in layout.tsx. */}
          <span
            className="material-symbols-outlined text-primary-container transition group-hover:text-tertiary-accent"
            style={{
              fontSize: "2.5rem",
              fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 48",
            }}
            aria-hidden="true"
          >
            school
          </span>
          <span className="font-display text-3xl font-extrabold tracking-normal text-primary-container">
            TeachMe
          </span>
        </Link>

        <nav
          className="order-3 flex w-full items-center gap-5 overflow-x-auto text-base font-bold md:order-none md:w-auto md:gap-7 md:overflow-visible"
          aria-label="ניווט ראשי"
        >
          {navItems.map((item) => {
            const isActive = item.href === activeHref;

            return (
              <Link
                className={
                  isActive
                    ? "shrink-0 border-b-2 border-tertiary-accent pb-1 text-primary-container"
                    : "shrink-0 pb-1 text-on-surface-variant transition hover:text-primary-container"
                }
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">{action ?? defaultAction}</div>
      </div>
    </header>
  );
}
