import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { logoutAction } from "@/components/layout/logout-action";

/**
 * Five-phase wizard stepper shared across the tutor-onboarding routes.
 *
 * Mirrors `mocks/wizard-phase-2.html` lines 38–67. Used by Story 2.1
 * (currentPhase=2) and reused by Story 2.2 (currentPhase=3), Story 2.4
 * (currentPhase=4), Story 2.6 (currentPhase=5).
 */

type Phase = 1 | 2 | 3 | 4 | 5;

interface WizardPhaseInfo {
  number: Phase;
  label: string;
}

const PHASES: readonly WizardPhaseInfo[] = [
  { number: 1, label: "חשבון" },
  { number: 2, label: "פרופיל" },
  { number: 3, label: "הסכם" },
  { number: 4, label: "אישור" },
  { number: 5, label: "רישום חוקי" },
];

interface WizardShellProps {
  currentPhase: Phase;
  children: ReactNode;
}

export function WizardShell({ currentPhase, children }: WizardShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-linen text-on-surface">
      <header className="bg-surface-lowest border-b border-linen-border">
        <div className="mx-auto flex max-w-5xl flex-row-reverse items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-primary-container">
              TeachMe
            </span>
          </Link>
          {/* A tutor mid-onboarding has no in-app destination that doesn't
              bounce straight back to the wizard (/dashboard → /tutor/me →
              here, since there's no profile row yet). So "exit" logs out —
              drafts are saved, and signing back in resumes the wizard. This
              is also the only reachable logout for a profile-less tutor. */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="cursor-pointer text-sm text-on-surface-variant transition hover:text-primary-container"
            >
              התנתקות
            </button>
          </form>
        </div>
      </header>

      <section className="bg-surface-lowest border-b border-linen-border">
        <nav
          aria-label="שלבי האשף"
          className="mx-auto max-w-5xl px-6 py-5"
        >
          <ol className="flex items-center justify-between">
            {PHASES.map((phase, idx) => {
              const isComplete = phase.number < currentPhase;
              const isActive = phase.number === currentPhase;
              const isLastPhase = idx === PHASES.length - 1;

              return (
                <li
                  key={phase.number}
                  className="flex flex-1 items-center"
                  aria-current={isActive ? "step" : undefined}
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        isComplete &&
                          "bg-primary-container text-on-primary",
                        isActive &&
                          "bg-tertiary-fixed text-on-tertiary-fixed ring-4 ring-tertiary-fixed/30",
                        !isComplete &&
                          !isActive &&
                          "bg-surface-container text-secondary",
                      )}
                      aria-hidden="true"
                    >
                      {isComplete ? "✓" : phase.number}
                    </div>
                    <span
                      className={cn(
                        "mt-2 text-xs",
                        isComplete && "font-bold text-primary-container",
                        isActive && "font-bold text-on-tertiary-fixed",
                        !isComplete && !isActive && "text-secondary",
                      )}
                    >
                      {phase.label}
                    </span>
                  </div>
                  {!isLastPhase && (
                    <div
                      className={cn(
                        "mx-3 h-0.5 flex-1",
                        phase.number < currentPhase
                          ? "bg-primary-container"
                          : "bg-linen-border",
                      )}
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </section>

      <main className="flex-1">{children}</main>
    </div>
  );
}
