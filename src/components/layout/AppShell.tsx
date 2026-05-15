import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

interface AppShellProps {
  children: ReactNode;
  activeHref?: string;
  headerAction?: ReactNode;
  mainClassName?: string;
  showFooter?: boolean;
}

export function AppShell({
  children,
  activeHref,
  headerAction,
  mainClassName = "flex-1",
  showFooter = true,
}: AppShellProps) {
  // SiteHeader is async (reads auth to decide between the כניסה link vs the
  // signed-in avatar) — React server components handle async children
  // transparently; no caller changes needed.
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-on-surface">
      <SiteHeader activeHref={activeHref} action={headerAction} />
      <main className={mainClassName}>{children}</main>
      {showFooter ? <SiteFooter /> : null}
    </div>
  );
}
