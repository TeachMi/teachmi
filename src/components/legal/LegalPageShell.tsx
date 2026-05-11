import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardBody } from "@/components/ui/card";
import { formatHebrewDate } from "@/lib/hebrew/format";
import type { LegalDocument } from "@/lib/legal/documents";

interface LegalPageShellProps {
  document: LegalDocument;
  children?: ReactNode;
}

const BackArrow = () => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="rtl:-scale-x-100"
    aria-hidden="true"
  >
    <path d="M19 12H5M11 5l-7 7 7 7" />
  </svg>
);

export function LegalPageShell({ document: doc, children }: LegalPageShellProps) {
  return (
    <AppShell mainClassName="flex flex-1 px-6 py-12 md:py-16">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 text-start">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-on-surface-variant transition hover:text-primary-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-accent"
        >
          <BackArrow />
          חזרה לדף הבית
        </Link>

        <div className="space-y-3">
          <p className="text-sm font-bold text-primary-container">TeachMe</p>
          <h1 className="font-display text-3xl font-extrabold text-primary-container">
            {doc.title}
          </h1>
        </div>

        <Card tone="error" padding="md" role="status" aria-live="polite">
          <CardBody className="text-base font-bold text-danger">
            טיוטה — בהמתנה לסקירה משפטית
          </CardBody>
        </Card>

        {children}

        <dl className="mt-2 grid grid-cols-1 gap-3 border-t border-linen-border pt-6 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-on-surface-variant">גרסה</dt>
            <dd className="mt-1 font-bold text-on-surface">{doc.version}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">עודכן לאחרונה</dt>
            <dd className="mt-1 font-bold text-on-surface">
              {formatHebrewDate(doc.lastUpdated)}
            </dd>
          </div>
        </dl>
      </section>
    </AppShell>
  );
}
