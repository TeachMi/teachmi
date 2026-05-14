import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "ניהול | TeachMe",
};

export default function AdminPage() {
  return (
    <AppShell activeHref="/admin" mainClassName="flex-1 bg-linen px-6 py-12">
      <section className="mx-auto w-full max-w-5xl space-y-6 text-start">
        <div>
          <p className="text-sm font-bold text-primary-container">TeachMe</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-primary-container">
            ניהול
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-on-surface-variant">
            אזור ניהול פנימי למייסדים. תורי בדיקה, שיעורים, מחלוקות ויומן ביקורת
            יתווספו בסיפורי Epic 7.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <AdminTile title="מורים לבדיקה" body="ממתין לסיפור 7.1" />
          <AdminTile title="שיעורים" body="ממתין לסיפורי 7.3-7.4" />
          <AdminTile title="יומן ביקורת" body="ממתין לסיפור 7.7" />
        </div>
      </section>
    </AppShell>
  );
}

function AdminTile({ title, body }: { title: string; body: string }) {
  return (
    <Card padding="sm" className="h-full">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardBody className="text-sm text-on-surface-variant">{body}</CardBody>
    </Card>
  );
}
