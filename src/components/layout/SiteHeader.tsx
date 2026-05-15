import Link from "next/link";
import type { ReactNode } from "react";
import { primaryNavItems } from "./navigation";

interface SiteHeaderProps {
  activeHref?: string;
  action?: ReactNode;
}

export function SiteHeader({ activeHref = "/", action }: SiteHeaderProps) {
  const defaultAction = (
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
          {/* Material Symbol `school` (graduation hat) — mock convention
              for the TeachMe wordmark icon. Replaces the older "ת" letter
              placeholder. Font loaded globally via layout.tsx.
              `style.fontSize` set inline because Google Fonts' CSS for the
              `material-symbols-outlined` class hard-codes `font-size: 24px`
              with higher specificity than Tailwind's `text-*` utilities;
              inline style beats both. `fontVariationSettings` matches the
              mock (FILL=0, wght=400) so the icon reads as an outlined
              graduation-cap glyph rather than a filled bold one. */}
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
