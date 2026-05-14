import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/guards";
import { listDependentsForParent } from "@/lib/dependents/dependents";
import { addDependentAction } from "./actions";
import { DependentForm } from "./DependentForm";
import { DEPENDENT_INITIAL_STATE } from "./state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "תלמידים בחשבון הורה | TeachMe",
};

interface DependentsPageProps {
  searchParams?: Promise<{ created?: string | string[] }>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DependentsPage({ searchParams }: DependentsPageProps) {
  const parent = await requireAuth("/account/dependents");
  const dependents = await listDependentsForParent(parent.id);
  const params = await searchParams;
  const created = firstParam(params?.created) === "1";

  return (
    <AppShell activeHref="/dashboard" mainClassName="flex-1 bg-linen px-6 py-12">
      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 text-start lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <p className="text-sm font-bold text-primary-container">החשבון שלי</p>
          <h1 className="font-display text-3xl font-extrabold text-primary-container">
            תלמידים בחשבון הורה
          </h1>
          <p className="leading-7 text-on-surface-variant">
            הוסיפו תלמידים מתחת לגיל 18 בלי לפתוח להם חשבון נפרד. ההורה מנהל את
            ההזמנות וההתראות.
          </p>
        </div>

        <div className="space-y-5 lg:col-span-3">
          {created && (
            <Card tone="success" padding="sm">
              <CardBody className="text-sm font-bold text-primary-container">
                התלמיד/ה נוסף/ה לחשבון.
              </CardBody>
            </Card>
          )}

          <Card padding="md">
            <CardHeader>
              <CardTitle>הוספת תלמיד/ה</CardTitle>
            </CardHeader>
            <CardBody>
              <DependentForm
                action={addDependentAction}
                initialState={DEPENDENT_INITIAL_STATE}
              />
            </CardBody>
          </Card>

          <Card padding="md">
            <CardHeader>
              <CardTitle>התלמידים שלי</CardTitle>
            </CardHeader>
            <CardBody>
              {dependents.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  עדיין לא נוספו תלמידים לחשבון.
                </p>
              ) : (
                <ul className="space-y-3">
                  {dependents.map((dependent) => (
                    <li
                      className="rounded-lg border border-linen-border bg-surface-lowest p-4"
                      key={dependent.id}
                    >
                      <p className="font-bold text-primary-container">
                        {dependent.name ?? "תלמיד/ה"}
                      </p>
                      <p className="mt-1 text-sm text-on-surface-variant">
                        תאריך לידה: {dependent.dateOfBirth ?? "לא צוין"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}
