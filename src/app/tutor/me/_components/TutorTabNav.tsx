// 3-tab navigation for the /tutor/me self-service surface.
//
// Story 2.10. Pattern mirrors `<StudentSubNav>` from Story 5.0 but uses
// `usePathname` to determine the active tab so the parent layout doesn't
// have to thread `activeTab` to every child page.
//
// RTL-safe: uses plain `flex` (NOT `flex-row-reverse`). In RTL the first
// child (פרופיל) renders on the RIGHT — exactly the intended order.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TabSpec {
  href: string;
  label: string;
}

const TABS: TabSpec[] = [
  { href: "/tutor/me", label: "פרופיל" },
  { href: "/tutor/me/schedule", label: "זמינות" },
  { href: "/tutor/me/invoices", label: "חשבוניות" },
];

export function TutorTabNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-linen-border bg-linen">
      <nav
        className="mx-auto flex max-w-7xl px-6"
        aria-label="ניווט אזור מורה"
      >
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "px-5 py-3 border-b-2 border-tertiary-accent text-primary-container text-sm font-bold"
                  : "px-5 py-3 border-b-2 border-transparent text-on-surface-variant hover:text-primary-container text-sm font-bold transition-colors"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
