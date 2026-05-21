// Marketplace homepage trust strip — four reassurance items from
// `landing-v2.html`. New section (no Story 3.1 equivalent); copy is a
// placeholder pending the founder's copy pass. RSC; zero client JS.

const ITEMS = [
  {
    icon: "verified",
    title: "מורים מאומתים אישית",
    body: "כל מורה עובר ראיון וקבלה לפני שמופיע בפלטפורמה.",
  },
  {
    icon: "event_busy",
    title: "ביטול חופשי",
    body: "עד 24 שעות לפני השיעור — הכסף יוחזר במלואו.",
  },
  {
    icon: "paid",
    title: "ללא עמלות נסתרות",
    body: "המחיר שאתם רואים — הוא המחיר שתשלמו.",
  },
] as const;

export function TrustStrip() {
  return (
    <section className="border-y border-linen-border bg-linen">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {ITEMS.map((item) => (
            <div key={item.icon} className="flex items-start gap-3 text-start">
              <span
                className="material-symbols-outlined shrink-0 text-3xl text-primary-container"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <div>
                <h3 className="font-display text-sm font-bold text-on-surface">
                  {item.title}
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-secondary">
                  {item.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
