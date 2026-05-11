import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

const tutors = {
  "noa-levi": {
    name: "נועה לוי",
    subject: "מתמטיקה - 5 יחידות",
  },
} as const;

interface BookingStubPageProps {
  searchParams?: Promise<{
    tutor?: string | string[];
  }>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookingStubPage({ searchParams }: BookingStubPageProps) {
  const params = await searchParams;
  const tutorId = firstParam(params?.tutor);
  const tutor = tutorId && tutorId in tutors ? tutors[tutorId as keyof typeof tutors] : null;

  return (
    <AppShell activeHref="/browse" mainClassName="flex-1 bg-linen">
      <section className="mx-auto flex w-full max-w-3xl flex-1 items-center px-6 py-12">
        <Card padding="lg" tone="success" shadow="sm" className="w-full text-start">
          <CardHeader>
            <p className="text-sm font-bold text-primary-container">הזמנה בבטא הסגורה</p>
            <CardTitle className="text-3xl">בקשת שיעור התקבלה</CardTitle>
          </CardHeader>
          <CardBody className="space-y-6 text-base leading-8 text-on-surface-variant">
            <p>
              נשמרה בקשת שיעור עם {tutor?.name ?? "המורה שבחרתם"}
              {tutor ? ` בתחום ${tutor.subject}` : ""}. המשך התשלום והאישור המלא יופעלו
              בסיפורי ההמשך של השוק וההזמנות.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/browse">חזרה לחיפוש</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">דף הבית</Link>
              </Button>
            </div>
          </CardBody>
        </Card>
      </section>
    </AppShell>
  );
}
