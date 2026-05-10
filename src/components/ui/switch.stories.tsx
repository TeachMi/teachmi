import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Switch } from "./switch";
import { Card, CardBody, CardHeader, CardTitle } from "./card";

const meta = {
  title: "UI/Switch",
  component: Switch,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Toggle switch wrapping Radix UI's Switch primitive. The thumb slides toward the end edge in both LTR and RTL — implemented via the `rtl:` variant on `translate-x-*` so logical direction is preserved.",
      },
    },
  },
  argTypes: {
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Switch id="default" {...args} />
      <label htmlFor="default" className="text-sm text-on-surface cursor-pointer">
        קבל התראות
      </label>
    </div>
  ),
};

export const On: Story = {
  args: { defaultChecked: true },
  render: (args) => (
    <div className="flex items-center gap-2">
      <Switch id="on" {...args} />
      <label htmlFor="on" className="text-sm text-on-surface cursor-pointer">
        הצגת לוח זמנים פתוח
      </label>
    </div>
  ),
};

export const WithLabel: Story = {
  render: () => {
    const Wrapper = () => {
      const [checked, setChecked] = useState(false);
      return (
        <div className="flex items-center justify-between gap-3 max-w-sm bg-white border border-linen-border rounded-lg p-3">
          <label htmlFor="profile-public" className="text-sm font-bold cursor-pointer">
            פרופיל ציבורי
          </label>
          <Switch
            id="profile-public"
            checked={checked}
            onCheckedChange={setChecked}
          />
        </div>
      );
    };
    return <Wrapper />;
  },
};

export const WithHint: Story = {
  render: () => (
    <div className="flex items-start justify-between gap-4 max-w-md bg-white border border-linen-border rounded-lg p-4">
      <div className="flex-1">
        <label
          htmlFor="weekly-digest"
          className="text-sm font-bold cursor-pointer block"
        >
          סיכום שבועי באימייל
        </label>
        <p
          id="weekly-digest-hint"
          className="text-xs text-on-surface-variant mt-0.5"
        >
          שליחת סיכום של שיעורים שהזמנתם והמלצות חדשות בכל יום ראשון.
        </p>
      </div>
      <Switch id="weekly-digest" defaultChecked aria-describedby="weekly-digest-hint" />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Switch id="d-off" disabled />
        <label htmlFor="d-off" className="text-sm text-on-surface-variant">
          התראות SMS (זמין לאחר אימות מספר)
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="d-on" disabled defaultChecked />
        <label htmlFor="d-on" className="text-sm text-on-surface-variant">
          התראות אימייל (חובה — לא ניתן לבטל)
        </label>
      </div>
    </div>
  ),
};

export const English: Story = {
  name: "LTR — English",
  globals: { direction: "ltr" },
  render: () => {
    const Wrapper = () => {
      const [checked, setChecked] = useState(true);
      return (
        <div className="flex items-center justify-between gap-3 max-w-sm bg-white border border-linen-border rounded-lg p-3">
          <label htmlFor="public" className="text-sm font-bold cursor-pointer">
            Public profile
          </label>
          <Switch id="public" checked={checked} onCheckedChange={setChecked} />
        </div>
      );
    };
    return <Wrapper />;
  },
};

export const NotificationPreferences: Story = {
  name: "Composition — student settings notifications pane",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/student-settings.html` — the \"התראות\" pane. Four notification preferences: 24h reminder, 1h reminder, post-lesson summary, marketing. The mock uses `<input type=\"checkbox\">` for these toggles; this story upgrades them to the design-system `Switch` per UX-DR8 (toggle = on/off binary state, not a checkbox). Sub-label \"אימייל\" mirrors the mock's channel hint.",
      },
    },
  },
  render: () => {
    const Wrapper = () => {
      const [prefs, setPrefs] = useState({
        reminder24h: true,
        reminder1h: true,
        postLessonSummary: true,
        marketing: false,
      });
      const set = (key: keyof typeof prefs) => (value: boolean) =>
        setPrefs((p) => ({ ...p, [key]: value }));
      const items: Array<{ key: keyof typeof prefs; title: string }> = [
        { key: "reminder24h", title: "תזכורת 24 שעות לפני שיעור" },
        { key: "reminder1h", title: "תזכורת שעה לפני שיעור" },
        { key: "postLessonSummary", title: "סיכום מהמורה לאחר שיעור" },
        { key: "marketing", title: "עדכוני שיווק וטיפים" },
      ];
      return (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>התראות</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="flex items-start justify-between gap-4"
                >
                  <div className="flex-1">
                    <label
                      htmlFor={`pref-${item.key}`}
                      className="text-sm font-bold cursor-pointer block"
                    >
                      {item.title}
                    </label>
                    <p className="text-xs text-secondary mt-0.5">אימייל</p>
                  </div>
                  <Switch
                    id={`pref-${item.key}`}
                    checked={prefs[item.key]}
                    onCheckedChange={set(item.key)}
                  />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      );
    };
    return <Wrapper />;
  },
};
