// Marketplace homepage FAQ — accordion from `landing-v2.html`. New section
// (no Story 3.1 equivalent); copy is a placeholder pending the founder's
// copy pass. Built on native `<details>`/`<summary>` so it stays zero
// client JS. RSC.

const FAQ = [
  {
    q: "כמה זה עולה?",
    a: "משלמים רק לפי שיעור, לפי המחיר שהמורה קובע. רוב המורים מציעים בטווח ₪80–₪220 לשיעור.",
  },
  {
    q: "איך בוחרים מורה?",
    a: "צפו בסרטוני ההיכרות, קראו ביקורות של תלמידים אחרים, והשוו מחיר וזמינות. בחרו מורה שמרגיש לכם מתאים — ותמיד אפשר לעבור למורה אחר בשיעור הבא.",
  },
  {
    q: "אפשר לבטל שיעור?",
    a: "כן — ביטול חופשי עד 24 שעות לפני השיעור, והכסף יוחזר במלואו.",
  },
  {
    q: "השיעורים אונליין?",
    a: "כן. השיעור מתקיים בחדר הווידאו המובנה של TeachMe, ישירות מהדפדפן — ללא צורך באפליקציה חיצונית.",
  },
] as const;

export function HomeFaq() {
  return (
    <section id="faq" className="border-t border-linen-border bg-linen">
      <div className="mx-auto max-w-3xl px-6 py-14 text-start">
        <h2 className="mb-6 font-display text-2xl font-extrabold text-primary-container">
          שאלות נפוצות
        </h2>

        <div className="space-y-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group overflow-hidden rounded-xl border border-linen-border bg-surface-lowest"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 p-4 [&::-webkit-details-marker]:hidden">
                <span className="font-display font-bold text-on-surface">
                  {item.q}
                </span>
                <span
                  className="material-symbols-outlined text-secondary transition-transform group-open:rotate-180"
                  aria-hidden="true"
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
  );
}
