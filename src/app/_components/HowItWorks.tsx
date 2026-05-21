// Marketplace homepage "how it works" band — three-step explainer from
// `landing-v2.html`. New section (no Story 3.1 equivalent); copy is a
// placeholder pending the founder's copy pass. RSC; zero client JS.

const STEPS = [
  {
    n: 1,
    icon: "search",
    title: "חפשו וצפו",
    body: "פתחו את רשימת המורים, צפו בסרטוני היכרות וקראו ביקורות אמיתיות.",
  },
  {
    n: 2,
    icon: "event_available",
    title: "בחרו זמן",
    body: "פתחו את היומן של המורה ובחרו שעה שמתאימה לכם.",
  },
  {
    n: 3,
    icon: "bolt",
    title: "הזמינו בלחיצה",
    body: "אישור מיידי במייל, תזכורת ביום השיעור, וחדר וידאו מוכן בלחיצה.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-7xl px-6 py-14 text-start">
        <h2 className="mb-8 font-display text-2xl font-extrabold text-primary-container">
          איך זה עובד
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="relative rounded-2xl border border-linen-border bg-surface-lowest p-6 text-start"
            >
              <div className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-primary-fixed font-display text-lg font-extrabold text-primary-container">
                {step.n}
              </div>
              <span
                className="material-symbols-outlined mb-3 block text-4xl text-tertiary-accent"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                {step.icon}
              </span>
              <h3 className="mb-2 font-display text-lg font-bold text-on-surface">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
