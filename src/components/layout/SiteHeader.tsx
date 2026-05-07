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
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link className="group flex items-center gap-3" href="/" aria-label="TeachMe דף הבית">
          <span className="flex size-10 items-center justify-center rounded-xl border border-primary-fixed-dim bg-primary-fixed/40 font-display text-lg font-extrabold text-primary-container transition group-hover:border-tertiary-accent">
            ת
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
