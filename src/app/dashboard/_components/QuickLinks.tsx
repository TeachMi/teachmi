import Link from "next/link";
import { Card } from "@/components/ui/card";

interface QuickLink {
  label: string;
  href: string | null; // null → disabled "בקרוב" row
}

const LINKS: QuickLink[] = [
  { label: "חיפוש מורה חדש", href: "/browse" },
  { label: "חשבוניות", href: null }, // Stories 4.7 / 8.x territory
  { label: "הגדרות חשבון", href: "/account/profile" },
];

export function QuickLinks() {
  return (
    <Card padding="md" className="text-start">
      <h3 className="mb-3 font-display text-base font-bold text-primary-container">
        פעולות מהירות
      </h3>
      <ul className="space-y-1 text-sm">
        {LINKS.map((link) => {
          if (link.href) {
            return (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-linen"
                >
                  <span>{link.label}</span>
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-base"
                  >
                    chevron_left
                  </span>
                </Link>
              </li>
            );
          }
          return (
            <li key={link.label}>
              <div
                aria-disabled="true"
                title="בקרוב"
                className="flex cursor-not-allowed items-center justify-between rounded-lg p-2 opacity-60"
              >
                <span>{link.label}</span>
                <span className="text-[10px] font-bold text-secondary">
                  בקרוב
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
