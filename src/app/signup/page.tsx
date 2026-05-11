import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <AppShell activeHref="/signin" mainClassName="flex-1 bg-linen">
      <section className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
        <div className="space-y-5 text-start">
          <p className="text-sm font-bold text-primary-container">TeachMe</p>
          <h1 className="max-w-3xl font-display text-4xl font-extrabold leading-tight text-primary-container md:text-5xl">
            יצירת חשבון תלמיד
          </h1>
          <p className="max-w-2xl text-base leading-8 text-on-surface-variant">
            התחילו מחיפוש מורה, המשיכו לבחירת שיעור ראשון, וחזרו לדשבורד כשהמערכת
            תפתח את ההרשמה המלאה.
          </p>
        </div>

        <Card padding="lg" shadow="sm" className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl">פרטים בסיסיים</CardTitle>
          </CardHeader>
          <CardBody>
            <form action="/browse" className="space-y-5" method="get">
              <div className="space-y-2">
                <label className="text-sm font-bold text-on-surface" htmlFor="displayName">
                  שם מלא
                </label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  autoComplete="name"
                  required
                  className="h-12 w-full rounded-lg border border-linen-border bg-surface-lowest px-4 text-start text-sm text-on-surface outline-none transition focus:border-primary-fixed-dim focus:ring-2 focus:ring-primary-fixed/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-on-surface" htmlFor="email">
                  אימייל
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="h-12 w-full rounded-lg border border-linen-border bg-surface-lowest px-4 text-start text-sm text-on-surface outline-none transition focus:border-primary-fixed-dim focus:ring-2 focus:ring-primary-fixed/50"
                />
              </div>

              <Button type="submit" size="lg" fullWidth>
                המשך לחיפוש מורים
              </Button>
            </form>
          </CardBody>
        </Card>
      </section>
    </AppShell>
  );
}
