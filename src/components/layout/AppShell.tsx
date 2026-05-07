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
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-on-surface">
      <SiteHeader activeHref={activeHref} action={headerAction} />
      <main className={mainClassName}>{children}</main>
      {showFooter ? <SiteFooter /> : null}
    </div>
  );
}
