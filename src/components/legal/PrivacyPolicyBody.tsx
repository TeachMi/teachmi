// Single source of truth for the privacy-policy body copy. Renders the same
// text on the canonical /legal/privacy page, inline on the signup form, and
// inside the re-acceptance flow at /legal/privacy/accept.
//
// Story 9.1 will replace the placeholder Hebrew prose below with counsel-final
// text and bump `documentVersion` in `src/lib/legal/documents.ts`. AC3's
// re-prompt logic then catches every existing user on their next signin.

export function PrivacyPolicyBody() {
  return (
    <div className="space-y-6 text-start text-base leading-7 text-on-surface">
      <p className="rounded-lg bg-warning/10 px-4 py-3 text-sm font-bold text-warning">
        זוהי טיוטה. הנוסח הסופי יעודכן לאחר סקירה משפטית לפני ההשקה הציבורית.
      </p>

      <section className="space-y-2">
        <h3 className="font-display text-lg font-bold text-primary-container">
          מבוא
        </h3>
        <p>
          TeachMe היא פלטפורמה ישראלית בעברית בלבד למפגש בין תלמידים למורים פרטיים. אנו
          מחויבים לפרטיות המשתמשים שלנו ופועלים בהתאם לחוק הגנת הפרטיות (כולל תיקון 13)
          והנחיות רשות הגנת הפרטיות.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-lg font-bold text-primary-container">
          המידע שאנחנו אוספים
        </h3>
        <p>
          בעת ההרשמה והשימוש בפלטפורמה אנחנו אוספים: שם מלא, כתובת אימייל, סוג חשבון
          (תלמיד/ה או מורה/ת), סיסמה מוצפנת, וכן מידע נלווה לפעילות בפלטפורמה — שעות
          זמינות (למורים), תיאור עצמי, סרטוני היכרות, היסטוריית שיעורים, הערות פרטיות,
          ודירוגים. למורים בלבד: פרטי חשבון בנק ופרטי עוסק להתחשבנות.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-lg font-bold text-primary-container">
          כיצד אנחנו משתמשים במידע
        </h3>
        <p>
          המידע משמש להפעלת הפלטפורמה — שיוך תלמידים למורים, ניהול לוחות זמנים, ביצוע
          תשלומים, יישוב מחלוקות, וביצוע פעולות אדמיניסטרטיביות. צוות האדמין רשאי לעיין
          בתכנים שנוצרו במסגרת השיעורים (סיכומים, הערות, יומני חדר השיעור) לצורך טיפול
          בתלונות ומחלוקות.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-lg font-bold text-primary-container">
          שיתוף מידע עם צדדים שלישיים
        </h3>
        <p>
          אנו עובדים עם ספקי שירות מובחרים: ספק תשלומים (PayMe Marketplace), ספק אימייל
          (Resend), ספק חשבוניות (Green Invoice), ושירות אנליטיקה (PostHog). מידע משותף
          רק לצרכים תפעוליים מוגדרים. איננו מוכרים מידע אישי לצדדים שלישיים לצורכי
          שיווק.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-lg font-bold text-primary-container">
          זכויותיכם
        </h3>
        <p>
          באפשרותכם לעיין במידע האישי שלכם, לבקש את תיקונו או מחיקתו, ולייצא עותק לפי
          חוק. פנייה לפרטיות תיענה תוך 30 יום. כל בקשה לתיקון או מחיקה תתועד בהתאם
          לדרישות תיקון 13.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-lg font-bold text-primary-container">
          יצירת קשר
        </h3>
        <p>
          בכל שאלה או בקשה בנושא פרטיות ניתן לפנות אלינו לכתובת{" "}
          <a
            className="border-b border-primary-container text-primary-container"
            href="mailto:privacy@teachme.co.il"
          >
            privacy@teachme.co.il
          </a>
          . מקרי דליפת מידע יטופלו לפי נוהל הודעת אירוע מוגדר (טיוטה — ימולא לפני
          ההשקה).
        </p>
      </section>
    </div>
  );
}
