"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio";
import { cn } from "@/lib/cn";

interface RoleCardPickerProps {
  defaultValue?: "student" | "tutor";
}

export function RoleCardPicker({ defaultValue = "student" }: RoleCardPickerProps) {
  return (
    <RadioGroup
      name="role"
      defaultValue={defaultValue}
      required
      className={cn("grid grid-cols-1 gap-4 md:grid-cols-2")}
      aria-label="בחירת תפקיד"
    >
      <RoleCardOption
        value="student"
        title="אני סטודנט/ית"
        subtitle="מחפש/ת מורה"
        bullets={["חיפוש מורים מומחים", "קביעת שיעורים בלחיצה", "חשבונית מס לכל שיעור"]}
      />
      <RoleCardOption
        value="tutor"
        title="אני מורה"
        subtitle="רוצה ללמד"
        bullets={[
          "פתיחת תיק עוסק זעיר ב-30 דקות",
          "עמלה הוגנת — אתם קובעים מחיר",
          "חשבוניות אוטומטיות",
        ]}
      />
    </RadioGroup>
  );
}

interface RoleCardOptionProps {
  value: "student" | "tutor";
  title: string;
  subtitle: string;
  bullets: string[];
}

function RoleCardOption({ value, title, subtitle, bullets }: RoleCardOptionProps) {
  const inputId = `role-${value}`;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "group cursor-pointer rounded-2xl border-2 border-linen-border bg-surface-lowest p-6 text-start transition",
        "hover:shadow-lg",
        "has-[[data-state=checked]]:border-primary-container has-[[data-state=checked]]:bg-primary-fixed/30",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex-1">
          <h3 className="font-display text-lg font-bold text-primary-container">{title}</h3>
          <p className="text-xs text-secondary">{subtitle}</p>
        </div>
        <RadioGroupItem value={value} id={inputId} />
      </div>
      <ul className="space-y-1.5 text-xs leading-relaxed text-on-surface-variant">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-1.5">
            <Check />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </label>
  );
}

function Check() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="0.85em"
      height="0.85em"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-primary-container"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
