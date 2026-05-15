import Link from "next/link";
import { legalLinks } from "./navigation";

export function SiteFooter() {
  return (
    <footer className="border-t border-primary-container bg-primary text-on-primary">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 px-8 py-14 text-start md:grid-cols-4">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            {/* Material Symbol `school` icon — matches the header (see
                SiteHeader.tsx for the inline-style rationale). Tertiary-
                fixed (gold) for footer contrast against the dark primary
                background. */}
            <span
              className="material-symbols-outlined text-tertiary-fixed"
              style={{
                fontSize: "1.75rem",
                fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 32",
              }}
              aria-hidden="true"
            >
              school
            </span>
            <h2 className="font-display text-xl font-bold">TeachMe</h2>
          </div>
          <p className="max-w-xs text-sm leading-7 text-on-primary-container">
            פלטפורמת המורים הפרטיים של ישראל.
            <br />
            מורים פרטיים. יומן זמינות אמיתי. שיעור בלחיצה.
          </p>
        </section>

        <section>
          <h2 className="mb-4 font-bold">שימוש באתר</h2>
          <ul className="space-y-2 text-sm text-on-primary-container">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link className="transition hover:text-tertiary-fixed" href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-4 font-bold">קהילה</h2>
          <ul className="space-y-2 text-sm text-on-primary-container">
            <li>
              <Link className="transition hover:text-tertiary-fixed" href="/browse">
                חיפוש מורים
              </Link>
            </li>
            <li>
              <Link className="transition hover:text-tertiary-fixed" href="/signin">
                כניסה לחשבון
              </Link>
            </li>
            <li>
              <Link className="transition hover:text-tertiary-fixed" href="/dashboard">
                השיעורים שלי
              </Link>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-4 font-bold">צרו קשר</h2>
          <div className="space-y-3 text-sm text-on-primary-container">
            <a className="block transition hover:text-tertiary-fixed" href="mailto:support@teachme.co.il">
              support@teachme.co.il
            </a>
            <p>ישראל בלבד · שיעורים אונליין</p>
          </div>
        </section>
      </div>
      <div className="border-t border-primary-container">
        <div className="mx-auto max-w-7xl px-8 py-4 text-center text-xs text-on-primary-container">
          © 2026 TeachMe - כל הזכויות שמורות.
        </div>
      </div>
    </footer>
  );
}
