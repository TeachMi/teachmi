import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/guards";
import { requestDataExportAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "הורדת מידע אישי | TeachMe",
};

interface DataExportPageProps {
  searchParams?: Promise<{ requested?: string | string[] }>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DataExportPage({ searchParams }: DataExportPageProps) {
  await requireAuth("/account/data");
  const params = await searchParams;
  const requested = firstParam(params?.requested) === "1";

  return (
    <AppShell activeHref="/dashboard" mainClassName="flex-1 bg-linen px-6 py-12">
      <section className="mx-auto w-full max-w-3xl space-y-6 text-start">
        <div>
          <p className="text-sm font-bold text-primary-container">החשבון שלי</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-primary-container">
            הורדת מידע אישי
          </h1>
          <p className="mt-3 leading-7 text-on-surface-variant">
            נשלח אליכם קישור חד-פעמי להורדת קובץ JSON עם המידע האישי ששמור כרגע
            במערכת TeachMe.
          </p>
        </div>

        {requested && (
          <Card tone="success" padding="sm">
            <CardBody className="text-sm font-bold text-primary-container">
              הקישור נשלח לאימייל שלכם. הוא תקף ל-24 שעות ולשימוש אחד בלבד.
            </CardBody>
          </Card>
        )}

        <Card padding="md">
          <CardHeader>
            <CardTitle>מה כלול בקובץ?</CardTitle>
          </CardHeader>
          <CardBody className="space-y-5 text-sm leading-7 text-on-surface-variant">
            <p>
              פרטי חשבון, היסטוריית הזמנות ושיעורים, הערות פרטיות שלכם, דירוגים,
              פניות תמיכה, קבלות הסכמה ואירועי ביקורת שנוגעים לחשבון.
            </p>
            <form action={requestDataExportAction}>
              <Button type="submit" variant="primary">
                שלחו לי קישור להורדה
              </Button>
            </form>
          </CardBody>
        </Card>
      </section>
    </AppShell>
  );
}
