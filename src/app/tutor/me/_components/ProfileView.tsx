// Read-only display of the tutor's profile, shown by default on /tutor/me.
// Story 2.10 amendment 2026-05-16: the user asked for an explicit edit
// affordance — landing on /tutor/me should make it OBVIOUS the profile is
// being viewed (not edited). The "ערוך פרופיל" button toggles into the
// editable ProfileForm below.
//
// RTL-safe: uses plain `flex justify-start`, `text-start`. No
// `flex-row-reverse` / `text-end` anywhere.

interface ProfileViewProps {
  displayName: string;
  bio: string;
  city: string;
  subjectsHe: string[];
  price45Ils: number | null;
  price60Ils: number | null;
  photoUrl: string | null;
  introVideoUrl: string | null;
  onEdit: () => void;
}

export function ProfileView({
  displayName,
  bio,
  city,
  subjectsHe,
  price45Ils,
  price60Ils,
  photoUrl,
  introVideoUrl,
  onEdit,
}: ProfileViewProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-linen-border bg-white p-6 text-start">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-bold text-primary-container">
            הפרופיל שלך
          </h2>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary-container px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary"
          >
            <span className="material-symbols-outlined text-base">edit</span>
            ערוך פרופיל
          </button>
        </div>

        {/* Photo + name + bio */}
        <div className="flex items-start gap-5">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-linen-border bg-surface-container">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
                ללא תמונה
              </div>
            )}
          </div>
          <div className="flex-1">
            <h3 className="mb-1 font-display text-2xl font-extrabold text-primary-container">
              {displayName}
            </h3>
            {city && (
              <p className="mb-3 text-sm text-on-surface-variant">{city}</p>
            )}
            {bio && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface">
                {bio}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Subjects */}
      <div className="rounded-xl border border-linen-border bg-white p-6 text-start">
        <h3 className="mb-3 font-display text-lg font-bold text-primary-container">
          מקצועות שאתם מלמדים
        </h3>
        {subjectsHe.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {subjectsHe.map((subj) => (
              <span
                key={subj}
                className="rounded-full border border-primary-container bg-primary-container px-4 py-2 text-sm font-bold text-on-primary"
              >
                {subj}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-secondary">לא נבחרו מקצועות עדיין.</p>
        )}
      </div>

      {/* Pricing */}
      <div className="rounded-xl border border-linen-border bg-white p-6 text-start">
        <h3 className="mb-3 font-display text-lg font-bold text-primary-container">
          תמחור — 2 אורכי שיעור
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-linen-border bg-linen p-4">
            <div className="text-xs text-secondary">שיעור 45 דק׳</div>
            <div className="font-display text-2xl font-bold text-primary-container">
              {price45Ils !== null ? `₪${price45Ils}` : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-linen-border bg-linen p-4">
            <div className="text-xs text-secondary">שיעור 60 דק׳</div>
            <div className="font-display text-2xl font-bold text-primary-container">
              {price60Ils !== null ? `₪${price60Ils}` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Intro video */}
      <div className="rounded-xl border border-linen-border bg-white p-6 text-start">
        <h3 className="mb-3 font-display text-lg font-bold text-primary-container">
          סרטון היכרות
        </h3>
        {introVideoUrl ? (
          <video
            controls
            src={introVideoUrl}
            className="w-full rounded-lg border border-linen-border bg-black"
          />
        ) : (
          <p className="text-sm text-secondary">לא הועלה סרטון עדיין.</p>
        )}
      </div>
    </div>
  );
}
