// Shared sub-navigation for the student-side surfaces under "השיעורים שלי".
// Mounted by /dashboard, /lessons/history, and /account/profile (each passes
// its own activeTab). Matches mocks/dashboard.html lines 63–70 + lesson-
// history.html lines 33–39 (3-tab convention — schedule / history / profile).
//
// Why a shared component rather than a Next.js layout.tsx: only TWO sibling
// routes need the sub-nav highlighting "השיעורים שלי" in the top nav
// (/dashboard and /lessons/history); /account/profile DOES show the sub-nav
// but the top-nav highlight moves AWAY from "השיעורים שלי" (the user has
// navigated to an account surface). A shared layout would force the same
// top-nav state across all three routes; a shared component lets each page
// own its activeHref independently. Trade-off documented in the Winston
// architecture pass for Story 5.0.

import Link from "next/link";

export type StudentSubNavTab = "schedule" | "history" | "profile";

interface StudentSubNavProps {
  activeTab: StudentSubNavTab;
}

interface TabSpec {
  id: StudentSubNavTab;
  label: string;
  href: string;
}

const TABS: TabSpec[] = [
  { id: "schedule", label: "לוח שיעורים", href: "/dashboard" },
  { id: "history", label: "היסטוריה", href: "/lessons/history" },
  { id: "profile", label: "פרופיל", href: "/account/profile" },
];

export function StudentSubNav({ activeTab }: StudentSubNavProps) {
  return (
    <div className="border-b border-linen-border bg-linen">
      <nav
        className="mx-auto flex max-w-7xl px-6"
        aria-label="ניווט השיעורים שלי"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "px-5 py-3 border-b-2 border-primary-container text-primary-container text-sm font-bold"
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
