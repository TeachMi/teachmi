import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

export function EmptyStateHero() {
  return (
    <Card tone="highlighted" padding="lg" className="text-start">
      <CardBody className="space-y-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-3xl text-primary-container"
          >
            search
          </span>
          <div className="flex-1 space-y-2">
            <h2 className="font-display text-xl font-extrabold text-primary-container">
              עדיין לא הזמנתם שיעור
            </h2>
            <p className="text-sm leading-7 text-on-surface-variant">
              מצאו מורה פרטי, ראו זמינות אמיתית, והזמינו שיעור בלחיצה.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/browse">חיפוש מורה ←</Link>
          </Button>
          <Button asChild variant="outline" size="md">
            <Link href="/">ראו את המקצועות הפופולריים</Link>
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
