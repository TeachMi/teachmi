import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

// Tutor-recruitment landing page. Mirrors `TeachMe/mocks/tutor-landing.html`.
// All CTAs open the role-scoped signup (`/signup?role=tutor`) — which the
// `(.)signup` intercepting route renders as the signup modal.
export const dynamic = "force-dynamic";

const TUTOR_SIGNUP_HREF = "/signup?role=tutor";

export const metadata: Metadata = {
  title: "ללמד ב-TeachMe · TeachMe",
  description:
    "לַמדו אונליין ב-TeachMe — תשלומים, יומן, חדר שיעור וחשבוניות במקום אחד. אתם קובעים את המחיר ואת השעות.",
};

const STEPS: readonly { icon: string; title: string; body: string }[] = [
  {
    icon: "edit_document",
    title: "הרשמו ויצרו פרופיל",
    body: "פרטים, מקצועות, סרטון היכרות ומחיר. ממלאים פעם אחת — כ-15 דקות.",
  },
  {
    icon: "fact_check",
    title: "קבלו אישור",
    body: "אנחנו עוברים על כל פרופיל ידנית כדי לשמור על רמה. בדרך כלל מאשרים תוך 24 שעות.",
  },
  {
    icon: "cast_for_education",
    title: "התחילו ללמד",
    body: "הפרופיל עולה לאוויר, תלמידים מזמינים שיעורים — ואתם פשוט מלמדים.",
  },
];

const BENEFITS: readonly { icon: string; title: string; body: string }[] = [
  {
    icon: "sell",
    title: "אתם קובעים את המחיר",
    body: "אתם מחליטים כמה שיעור שווה. בלי מינימום, בלי תקרה — ובלי שנתערב בתמחור שלכם.",
  },
  {
    icon: "public",
    title: "מלמדים מכל מקום, בכל זמן",
    body: "כל השיעורים אונליין. מהבית או מכל מקום עם אינטרנט — ובשעות שאתם בוחרים.",
  },
  {
    icon: "rocket_launch",
    title: "מתחילים מהר",
    body: "גדילה מקצועית מהירה — אפשר להתחיל ללמד תוך ימים ספורים מתחילת התהליך.",
  },
];

const SUBJECTS: readonly string[] = [
  "מתמטיקה",
  "אנגלית",
  "לשון והבעה",
  "פסיכומטרי",
  "פיזיקה",
  "כימיה",
  "מדעי המחשב",
  "ועוד",
];

const TOOLS: readonly { icon: string; title: string; body: string }[] = [
  {
    icon: "credit_card",
    title: "סליקה ותשלום דרך האתר",
    body: "התלמיד משלם בכרטיס דרך TeachMe, והתשלום מגיע אליכם. בלי לרדוף אחרי כסף.",
  },
  {
    icon: "calendar_month",
    title: "יומן חכם",
    body: "מגדירים זמינות פעם אחת, התלמידים מזמינים לבד. הסנכרון אוטומטי.",
  },
  {
    icon: "videocam",
    title: "חדרי שיעור וירטואליים",
    body: "חדר וידאו עם לוח שיתופי, מובנה בדפדפן. בלי זום ובלי לינקים.",
  },
  {
    icon: "auto_awesome",
    title: "סיכומי AI",
    body: "סיכום שיעור אוטומטי שנשלח לתלמיד אחרי כל מפגש — בלי עבודה נוספת.",
  },
  {
    icon: "support_agent",
    title: "תמיכה מקצועית",
    body: "צוות אנושי לצידכם — לכל שאלה טכנית או פדגוגית.",
  },
  {
    icon: "badge",
    title: "פרופיל שמשווק אתכם",
    body: "פרופיל ציבורי עם סרטון, ביקורות ודירוג — שמושך תלמידים חדשים.",
  },
];

const FAQ: readonly { q: string; a: string }[] = [
  {
    q: "מי יכול ללמד ב-TeachMe?",
    a: "תושבי ישראל בעלי תיק עוסק פעיל — עוסק זעיר, פטור או מורשה. אין לכם עדיין עוסק? אשף ההצטרפות שלנו מלווה אתכם בפתיחת התיק מול הרשויות, בתהליך מודרך וקצר.",
  },
  {
    q: "כמה עולה להצטרף?",
    a: "ההרשמה ויצירת הפרופיל — חינם לגמרי. TeachMe גובה עמלה אחידה ושקופה רק על שיעורים שהתקיימו בפועל. אין דמי מנוי ואין עלויות נסתרות.",
  },
  {
    q: "כמה אפשר להרוויח?",
    a: "אתם קובעים את מחיר השיעור — אין מינימום ואין תקרה. ההכנסה תלויה במחיר שתבחרו ובמספר השיעורים שתלמדו.",
  },
  {
    q: "תוך כמה זמן אפשר להתחיל ללמד?",
    a: "אחרי אישור הפרופיל — בדרך כלל עד 24 שעות — אפשר לקבל הזמנות. מורים רבים מלמדים שיעור ראשון תוך ימים ספורים מתחילת התהליך.",
  },
  {
    q: "אילו מקצועות ורמות אפשר ללמד?",
    a: "כל מקצוע וכל רמה — מיסודי, דרך בגרות ופסיכומטרי ועד אקדמי. אתם מגדירים בפרופיל מה אתם מלמדים ולאיזו רמה.",
  },
  {
    q: "צריך ציוד מיוחד?",
    a: "מחשב עם מצלמה ומיקרופון, וחיבור אינטרנט יציב. חדר השיעור עצמו מובנה בדפדפן — אין מה להתקין.",
  },
];

function TutorSignupCta() {
  return (
    <Button asChild variant="accent" size="lg">
      <Link href={TUTOR_SIGNUP_HREF}>
        <span>צרו פרופיל מורה</span>
        <span aria-hidden="true" className="material-symbols-outlined">
          arrow_back
        </span>
      </Link>
    </Button>
  );
}

function SectionEyebrow({ children }: { children: string }) {
  return <p className="mb-1 text-sm font-bold text-tertiary-accent">{children}</p>;
}

export default function BecomeATutorPage() {
  return (
    <AppShell activeHref="/become-a-tutor">
      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden bg-primary-container text-on-primary">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-primary-container/40 mix-blend-multiply"
        />
        <div
          aria-hidden="true"
          className="linen-texture pointer-events-none absolute inset-0 opacity-70 mix-blend-screen"
        />
        <div className="relative mx-auto w-full max-w-7xl px-6 py-16 text-start lg:py-24">
          <div className="max-w-3xl">
            <h1 className="mb-6 font-display text-4xl font-extrabold leading-tight md:text-5xl lg:text-6xl">
              אתם מלמדים.
              <br />
              אנחנו דואגים לשאר.
            </h1>
            <p className="mb-8 max-w-2xl text-lg leading-relaxed text-on-primary-container">
              TeachMe נותנת למורים בישראל ללמד אונליין בלי כאב ראש — תשלומים,
              יומן, חדר שיעור וחשבוניות במקום אחד. אתם קובעים את המחיר ואת השעות.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <TutorSignupCta />
              <span className="flex items-center gap-2 text-sm text-on-primary-container">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-base text-tertiary-fixed"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
                הצטרפות חינם
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 3 steps ===== */}
      <section className="bg-surface">
        <div className="mx-auto w-full max-w-7xl px-6 py-14 text-start">
          <div className="mb-8">
            <SectionEyebrow>להתחיל ב-3 צעדים</SectionEyebrow>
            <h2 className="font-display text-2xl font-extrabold text-primary-container">
              מהרשמה ועד שיעור ראשון
            </h2>
          </div>
          <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Card radius="2xl" padding="md" className="relative h-full text-start">
                  <CardBody>
                    <span className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-primary-fixed font-display text-lg font-extrabold text-primary-container">
                      {index + 1}
                    </span>
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined mb-3 block text-4xl text-tertiary-accent"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {step.icon}
                    </span>
                    <h3 className="mb-2 font-display text-lg font-bold text-on-surface">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-on-surface-variant">
                      {step.body}
                    </p>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===== Benefits ===== */}
      <section className="border-y border-linen-border bg-linen">
        <div className="mx-auto w-full max-w-7xl px-6 py-14 text-start">
          <div className="mb-8">
            <SectionEyebrow>למה מורים בוחרים ב-TeachMe</SectionEyebrow>
            <h2 className="font-display text-2xl font-extrabold text-primary-container">
              העבודה שלכם, בתנאים שלכם
            </h2>
          </div>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <li key={benefit.title}>
                <Card radius="2xl" padding="md" className="h-full text-start">
                  <CardBody>
                    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-fixed/50">
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined text-2xl text-primary-container"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        {benefit.icon}
                      </span>
                    </span>
                    <h3 className="mb-2 font-display text-lg font-bold text-on-surface">
                      {benefit.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-on-surface-variant">
                      {benefit.body}
                    </p>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ===== What you teach ===== */}
      <section className="bg-surface">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-8 px-6 py-14 text-start lg:grid-cols-2">
          <div>
            <SectionEyebrow>מה מלמדים</SectionEyebrow>
            <h2 className="mb-3 font-display text-2xl font-extrabold text-primary-container">
              את כל המקצועות — אונליין
            </h2>
            <p className="mb-4 leading-relaxed text-on-surface-variant">
              כל מקצוע וכל רמה, מיסודי ועד אקדמי. המבוקשים ביותר בישראל הם{" "}
              <strong className="text-on-surface">מתמטיקה לבגרות</strong> — בכל
              היחידות והרמות — ו<strong className="text-on-surface">אנגלית</strong>.
              כל השיעורים מתקיימים אונליין, בחדר הווידאו של TeachMe.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((subject) => (
                <span
                  key={subject}
                  className="rounded-lg bg-primary-fixed/40 px-3 py-1.5 text-sm font-bold text-primary-container"
                >
                  {subject}
                </span>
              ))}
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-primary-container text-start">
            <div
              aria-hidden="true"
              className="linen-texture pointer-events-none absolute inset-0 opacity-70 mix-blend-screen"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-primary-container/40 mix-blend-multiply"
            />
            <div className="relative p-8">
              <span
                aria-hidden="true"
                className="material-symbols-outlined mb-3 block text-5xl text-tertiary-fixed"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                workspace_premium
              </span>
              <h3 className="mb-2 font-display text-xl font-bold text-on-primary">
                הביקוש הכי גבוה — בגרות
              </h3>
              <p className="text-sm leading-relaxed text-on-primary-container">
                עונת הבגרויות מביאה אלפי תלמידים שמחפשים מורה. מתמטיקה ואנגלית
                מובילות — אבל יש ביקוש לכל מקצוע.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Platform tools ===== */}
      <section className="border-y border-linen-border bg-linen">
        <div className="mx-auto w-full max-w-7xl px-6 py-14 text-start">
          <div className="mb-8">
            <SectionEyebrow>הכלים שמקבלים</SectionEyebrow>
            <h2 className="font-display text-2xl font-extrabold text-primary-container">
              כל מה שצריך כדי ללמד — במקום אחד
            </h2>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((tool) => (
              <li key={tool.title}>
                <Card radius="2xl" padding="md" className="h-full text-start">
                  <CardBody>
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined mb-3 block text-3xl text-primary-container"
                    >
                      {tool.icon}
                    </span>
                    <h3 className="mb-1.5 font-display text-base font-bold text-on-surface">
                      {tool.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-on-surface-variant">
                      {tool.body}
                    </p>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="bg-surface">
        <div className="mx-auto w-full max-w-3xl px-6 py-14 text-start">
          <h2 className="mb-6 font-display text-2xl font-extrabold text-primary-container">
            שאלות נפוצות
          </h2>
          <div className="space-y-3">
            {FAQ.map((item, index) => (
              <details
                key={item.q}
                open={index === 0}
                className="group overflow-hidden rounded-xl border border-linen-border bg-surface-lowest"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <span className="font-display font-bold text-on-surface">
                    {item.q}
                  </span>
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined shrink-0 text-secondary transition-transform group-open:rotate-180"
                  >
                    expand_more
                  </span>
                </summary>
                <div className="border-t border-linen-border px-4 pb-4 pt-3 text-sm leading-relaxed text-on-surface-variant">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Final CTA ===== */}
      <section className="relative overflow-hidden bg-primary-container text-on-primary">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-primary-container/40 mix-blend-multiply"
        />
        <div
          aria-hidden="true"
          className="linen-texture pointer-events-none absolute inset-0 opacity-70 mix-blend-screen"
        />
        <div className="relative mx-auto w-full max-w-4xl px-6 py-16 text-center">
          <h2 className="mb-3 font-display text-3xl font-extrabold md:text-4xl">
            מוכנים ללמד?
          </h2>
          <p className="mx-auto mb-7 max-w-xl leading-relaxed text-on-primary-container">
            צרו פרופיל מורה ב-15 דקות. ההצטרפות חינם, והאישור בדרך כלל תוך 24
            שעות.
          </p>
          <div className="flex justify-center">
            <TutorSignupCta />
          </div>
        </div>
      </section>
    </AppShell>
  );
}
