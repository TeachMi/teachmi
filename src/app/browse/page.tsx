import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatHebrewWeekday, formatIlsCurrency } from "@/lib/hebrew/format";

const featuredTutor = {
  id: "noa-levi",
  name: "נועה לוי",
  subject: "מתמטיקה - 5 יחידות",
  price: 180,
  nextSlot: "2026-05-12T14:30:00Z",
  rating: "4.9",
};

export default function BrowsePage() {
  return (
    <AppShell activeHref="/browse" mainClassName="flex-1 bg-linen">
      <section className="mx-auto w-full max-w-7xl space-y-8 px-6 py-12">
        <div className="grid grid-cols-1 gap-6 text-start lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
          <div className="space-y-4">
            <p className="text-sm font-bold text-primary-container">חיפוש מורים</p>
            <h1 className="font-display text-4xl font-extrabold leading-tight text-primary-container md:text-5xl">
              מורים זמינים לשיעור ראשון
            </h1>
            <p className="max-w-3xl text-base leading-8 text-on-surface-variant">
              בחרו מורה, ראו מחיר וזמינות קרובה, והמשיכו להזמנת שיעור בודד.
            </p>
          </div>

          <Card padding="sm" tone="success">
            <CardBody className="space-y-1 text-start">
              <p className="text-sm text-on-surface-variant">תוצאות זמינות</p>
              <p className="font-display text-3xl font-extrabold text-primary-container">
                1 מורה
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-5">
          <article aria-label={`${featuredTutor.name} - ${featuredTutor.subject}`}>
            <Card padding="lg" shadow="sm">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <CardHeader className="mb-0">
                  <p className="text-sm font-bold text-tertiary-accent">
                    {featuredTutor.subject}
                  </p>
                  <CardTitle className="text-2xl">{featuredTutor.name}</CardTitle>
                  <CardBody className="mt-3 grid grid-cols-1 gap-3 text-on-surface-variant sm:grid-cols-3">
                    <span>דירוג {featuredTutor.rating}</span>
                    <span>{formatIlsCurrency(featuredTutor.price)} לשיעור</span>
                    <span>זמינות קרובה: {formatHebrewWeekday(featuredTutor.nextSlot)}</span>
                  </CardBody>
                </CardHeader>

                <Button asChild size="lg">
                  <Link href={`/booking-stub?tutor=${featuredTutor.id}`}>
                    הזמנת שיעור עם {featuredTutor.name}
                  </Link>
                </Button>
              </div>
            </Card>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
