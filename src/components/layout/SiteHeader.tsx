import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth/auth";
import { Avatar } from "@/components/ui/avatar";
import { resolveProfilePhotoUrl } from "@/app/account/profile/upload-actions";
import { primaryNavItems } from "./navigation";

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

  // Resolve the avatar's image source. Priority:
  //   1. Our `profile_photo_r2_key` → fresh presigned GET URL (via stub or
  //      real R2 provider). Null in stub mode (browser can't fetch
  //      `stub.r2.local`).
  //   2. Auth.js `user.image` (OAuth provider URL — Google profile picture).
  //   3. Avatar falls back to initials.
  const profilePhotoUrl = user
    ? await resolveProfilePhotoUrl(user.profilePhotoR2Key ?? null)
    : null;
  const avatarSrc = profilePhotoUrl ?? user?.image ?? undefined;

  const defaultAction = user ? (
    <Link
      href="/account/profile"
      aria-label="חשבון משתמש"
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
              fontSize: "2.25rem",
              fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 40",
            }}
            aria-hidden="true"
          >
            school
          </span>
          <span className="font-display text-2xl font-extrabold tracking-normal text-primary-container">
            TeachMe
          </span>
        </Link>

        <nav
          className="order-3 flex w-full items-center gap-5 overflow-x-auto text-sm font-bold md:order-none md:w-auto md:gap-7 md:overflow-visible"
          aria-label="ניווט ראשי"
        >
          {primaryNavItems.map((item) => {
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
