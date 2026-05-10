import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Textarea } from "./textarea";
import { Button } from "./button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  args: {
    label: "ספרו על עצמכם",
    placeholder: "מה הסטיל ההוראה שלכם? במה אתם מתמחים?",
  },
  argTypes: {
    tone: {
      control: "inline-radio",
      options: ["default", "error"],
    },
    surface: {
      control: "inline-radio",
      options: ["white", "linen"],
    },
    size: {
      control: "inline-radio",
      options: ["sm", "md", "lg"],
    },
    autoGrow: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Textarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: {
    label: "הערה למורה",
    placeholder: "מה תרצו ללמוד בשיעור?",
    hint: "הערה זו תוצג למורה לפני השיעור.",
  },
};

export const Error: Story = {
  args: {
    defaultValue: "לא",
    error: "תיאור קצר מדי — הוסיפו לפחות 20 תווים.",
  },
};

export const Disabled: Story = {
  args: {
    defaultValue: "ביוגרפיית מורה זמינה לעריכה רק לאחר אישור הפרופיל.",
    disabled: true,
    hint: "לא ניתן לערוך עד לאישור הפרופיל על ידי הצוות.",
  },
};

export const AutoGrow: Story = {
  name: "Auto-grow (3 → 6 → 9 lines)",
  args: {
    autoGrow: true,
    minRows: 3,
    maxRows: 12,
    label: "ביוגרפיה (גדל אוטומטית)",
    placeholder: "כתבו על ניסיונכם בהוראה…",
  },
  render: (args) => {
    const lines3 = Array.from({ length: 3 }, (_, i) => `שורה ${i + 1}`).join("\n");
    const lines6 = Array.from({ length: 6 }, (_, i) => `שורה ${i + 1}`).join("\n");
    const lines9 = Array.from({ length: 9 }, (_, i) => `שורה ${i + 1}`).join("\n");
    return (
      <div className="flex flex-col gap-6 max-w-md">
        <Textarea {...args} defaultValue={lines3} label="3 שורות" />
        <Textarea {...args} defaultValue={lines6} label="6 שורות" />
        <Textarea {...args} defaultValue={lines9} label="9 שורות (כולל גלילה אם > maxRows)" />
      </div>
    );
  },
};

export const WithCharCount: Story = {
  name: "With char-count (soft warning at 90%, hard limit at 100%)",
  args: {
    label: "סיכום שיעור",
    maxLength: 240,
    hint: "סיכום קצר מסייע לסטודנט לזכור את הנקודות החשובות.",
  },
  render: (args) => {
    const Wrapper = () => {
      const [value, setValue] = useState(
        "סטודנט/ית הראו התקדמות נאה בנושא תרגילי וקטורים והבנת מערכי קואורדינטות. ממליץ להמשיך בתרגול בית.",
      );
      return (
        <div className="max-w-md">
          <Textarea {...args} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      );
    };
    return <Wrapper />;
  },
};

export const English: Story = {
  name: "LTR — English",
  globals: { direction: "ltr" },
  args: {
    label: "Tell us about yourself",
    placeholder: "What's your teaching style? What do you specialize in?",
    hint: "This will appear on your public profile.",
  },
};

export const TutorBio: Story = {
  name: "Composition — tutor profile bio editor",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/tutor-profile-editor.html` — the \"תמונה וביוגרפיה\" section. Tutor edits their bio (textarea with auto-grow + char-count) alongside their existing photo. Real bio copy from the mock; primary action is the page-level \"שמרו ושלחו לאישור\" button per the re-approval flow.",
      },
    },
  },
  render: () => {
    const Wrapper = () => {
      const [bio, setBio] = useState(
        "מורה למתמטיקה וטכנולוגיה עם תואר ד״ר מאוניברסיטת תל אביב. מלמדת מעל 8 שנים — מבית הספר התיכון ועד הכנה לפסיכומטרי.",
      );
      return (
        <form
          className="max-w-2xl space-y-5"
          onSubmit={(e) => e.preventDefault()}
        >
          <Card>
            <CardHeader>
              <CardTitle>תמונה וביוגרפיה</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="flex items-start gap-5">
                <div
                  aria-hidden
                  className="h-24 w-24 shrink-0 rounded-full border-2 border-linen-border bg-surface-container"
                />
                <div className="flex-1 space-y-3">
                  <button
                    type="button"
                    className="text-xs font-bold text-primary-container border-b border-primary-container"
                  >
                    החליפו תמונה
                  </button>
                  <Textarea
                    label="ביוגרפיה"
                    surface="linen"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    autoGrow
                    minRows={4}
                    maxRows={10}
                    maxLength={500}
                    hint="הביוגרפיה תופיע בעמוד הציבורי שלכם. שינוי מהותי דורש אישור מחדש (~24 שעות)."
                  />
                </div>
              </div>
            </CardBody>
          </Card>
          <div className="flex flex-row-reverse gap-3">
            <Button variant="primary" type="submit" className="flex-1">
              שמרו ושלחו לאישור
            </Button>
            <Button variant="ghost" type="button">
              ביטול
            </Button>
          </div>
        </form>
      );
    };
    return <Wrapper />;
  },
};
