import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/AppShell";
import { StudentSubNav } from "@/components/layout/StudentSubNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOut } from "@/lib/auth/auth";
import type { AppRole } from "@/lib/auth/roles";
import { requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import {
  requirePrivacyConsent,
  type DbForPrivacyConsent,
} from "@/lib/legal/privacy-consent";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "פרופיל והגדרות · TeachMe",
  description: "ניהול פרטים אישיים, אמצעי תשלום, התראות ואבטחה.",
};

// Form-action-based signout. Lives on the profile page's "אבטחה" pane —
// users sign out via the proper account-management surface instead of a
// header button that competes with the navigation chrome.
//
// Why `signOut({ redirect: false })` + explicit `redirect("/")`: under our
// dynamic-config Auth.js wiring (NextAuth(() => createAuthConfig()) — see
// AGENTS.md), the redirect option doesn't always issue NEXT_REDIRECT
// reliably in a Server Action context. The page would re-render and hit
// `requireAuth` with no session, bouncing the user to /signin instead of
// the intended landing. Splitting the two calls is unambiguous and the
// existing redirect from next/navigation is the canonical Next.js
// mechanism. Lands the user on the public marketing entry-point post-
// signout rather than on a bare /signin form.
async function signOutAction() {
  "use server";

  await signOut({ redirect: false });
  redirect("/");
}

interface UserProfile {
  name: string;
  email: string;
  dateOfBirth: string;
}

async function readUserProfile(userId: string): Promise<UserProfile> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        name: users.name,
        email: users.email,
        dateOfBirth: users.dateOfBirth,
      })
      .from(users)
      .where(eq(users.id, userId));
    const row = rows[0];
    return {
      name: row?.name ?? "",
      email: row?.email ?? "",
      // `date` columns come back as `Date` from the pg driver in some configs
      // and as `string` in others (Drizzle's `date()` returns string by
      // default). Normalize to YYYY-MM-DD or "".
      dateOfBirth: normalizeDateOfBirth(row?.dateOfBirth),
    };
  } catch (err) {
    console.error("[profile] user lookup failed", err);
    return { name: "", email: "", dateOfBirth: "" };
  }
}

function normalizeDateOfBirth(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Already a string — assume YYYY-MM-DD or trim a trailing time portion.
  return value.slice(0, 10);
}

export default async function AccountProfilePage() {
  const user = await requireAuth("/account/profile");
  await requirePrivacyConsent({
    userId: user.id,
    currentPath: "/account/profile",
    db: getDb() as unknown as DbForPrivacyConsent,
    redirectFn: redirect,
  });

  const profile = await readUserProfile(user.id);

  // Story 5.0: hide the StudentSubNav for non-students. The sub-nav surfaces
  // schedule/history which are student-only concepts; a tutor on /account/
  // profile shouldn't see them. The profile form itself is shared (name,
  // DOB, etc. apply to all roles).
  const showSubNav = (user.role as AppRole) === "student";

  return (
    <AppShell activeHref="/dashboard" mainClassName="flex flex-1 flex-col">
      {showSubNav && <StudentSubNav activeTab="profile" />}

      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-4">
        <aside className="lg:col-span-1">
          <h1 className="mb-4 font-display text-2xl font-extrabold text-primary-container text-start">
            הגדרות
          </h1>
          <SectionNav />
        </aside>

        <div className="space-y-5 lg:col-span-3">
          <Card padding="lg" className="text-start" id="personal">
            <h2 className="mb-4 font-display text-xl font-bold text-primary-container">
              פרטים אישיים
            </h2>
            <ProfileForm
              initialName={profile.name}
              initialEmail={profile.email}
              initialDateOfBirth={profile.dateOfBirth}
            />
          </Card>

          <Card padding="lg" className="text-start" id="payment">
            <h2 className="mb-2 font-display text-xl font-bold text-primary-container">
              אמצעי תשלום
            </h2>
            <p className="text-sm text-on-surface-variant">
              בקרוב — תוכלו להוסיף ולנהל אמצעי תשלום לאחר השקת התשלומים החיים.
            </p>
          </Card>

          <Card padding="lg" className="text-start" id="notif">
            <h2 className="mb-2 font-display text-xl font-bold text-primary-container">
              התראות
            </h2>
            <p className="text-sm text-on-surface-variant">
              בקרוב — בחירת ערוצי תקשורת ותדירות הודעות.
            </p>
          </Card>

          <Card padding="lg" className="text-start" id="security">
            <h2 className="mb-2 font-display text-xl font-bold text-primary-container">
              אבטחה
            </h2>
            <p className="mb-4 text-sm text-on-surface-variant">
              לשינוי סיסמה השתמשו בתהליך איפוס הסיסמה. כדי להתנתק לחצו על כפתור היציאה.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="outline" size="md">
                <Link href="/signin/forgot">איפוס סיסמה</Link>
              </Button>
              <form action={signOutAction}>
                <Button type="submit" variant="outline" size="md">
                  יציאה מהחשבון
                </Button>
              </form>
            </div>
          </Card>

          <Card tone="error" padding="lg" className="text-start" id="danger">
            <h2 className="mb-2 font-display text-xl font-bold text-danger">
              מחיקת חשבון
            </h2>
            <p className="mb-4 text-sm leading-7 text-on-surface-variant">
              מחיקת חשבון תסיר את ההיסטוריה, החשבוניות וההגדרות. תהליך המחיקה
              ניתן לביטול ב-30 הימים הראשונים.
            </p>
            <Button asChild variant="outline" size="md">
              <Link href="/account/delete">ראו פרטים על מחיקת חשבון</Link>
            </Button>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}

function SectionNav() {
  const items: Array<{ href: string; icon: string; label: string; danger?: boolean }> = [
    { href: "#personal", icon: "person", label: "פרטים אישיים" },
    { href: "#payment", icon: "credit_card", label: "אמצעי תשלום" },
    { href: "#notif", icon: "notifications", label: "התראות" },
    { href: "#security", icon: "lock", label: "אבטחה" },
    { href: "#danger", icon: "delete", label: "מחיקת חשבון", danger: true },
  ];
  return (
    <nav className="space-y-1 rounded-xl border border-linen-border bg-white p-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-linen" +
            (item.danger ? " text-danger" : " text-on-surface")
          }
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-base"
          >
            {item.icon}
          </span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
