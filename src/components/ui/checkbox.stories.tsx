import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Checkbox, CheckboxField } from "./checkbox";
import { Button } from "./button";
import { Input } from "./input";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "UI/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  argTypes: {
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox id="default" {...args} />
      <label htmlFor="default" className="text-sm text-on-surface cursor-pointer">
        תזכרו אותי במכשיר זה
      </label>
    </div>
  ),
};

export const Checked: Story = {
  args: { defaultChecked: true },
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox id="checked" {...args} />
      <label htmlFor="checked" className="text-sm text-on-surface cursor-pointer">
        מסכים לתנאי השימוש
      </label>
    </div>
  ),
};

export const Indeterminate: Story = {
  name: "Indeterminate (mixed selection)",
  render: () => {
    const Wrapper = () => {
      const [a, setA] = useState(true);
      const [b, setB] = useState(false);
      const allChecked = a && b;
      const noneChecked = !a && !b;
      const computedParent: boolean | "indeterminate" = allChecked
        ? true
        : noneChecked
          ? false
          : "indeterminate";

      const onParentChange = (next: boolean | "indeterminate") => {
        const value = next === true;
        setA(value);
        setB(value);
      };

      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="parent"
              checked={computedParent}
              onCheckedChange={onParentChange}
            />
            <label htmlFor="parent" className="text-sm font-bold text-on-surface cursor-pointer">
              קבל כל ההתראות
            </label>
          </div>
          <div className="flex flex-col gap-2 ps-7">
            <div className="flex items-center gap-2">
              <Checkbox
                id="email"
                checked={a}
                onCheckedChange={(v) => setA(v === true)}
              />
              <label htmlFor="email" className="text-sm text-on-surface cursor-pointer">
                אימייל
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="sms"
                checked={b}
                onCheckedChange={(v) => setB(v === true)}
              />
              <label htmlFor="sms" className="text-sm text-on-surface cursor-pointer">
                SMS
              </label>
            </div>
          </div>
        </div>
      );
    };
    return <Wrapper />;
  },
};

export const WithLabel: Story = {
  name: "WithLabel — CheckboxField wrapper",
  render: () => (
    <CheckboxField
      label="קבלו עדכונים על מורים חדשים במקצוע שלכם"
    />
  ),
};

export const WithHint: Story = {
  render: () => (
    <CheckboxField
      label="הוספת לוח זמנים פתוח"
      hint="פתיחת לוח זמנים חוסכת תקשורת — סטודנטים יכולים להזמין שיעורים ישירות."
    />
  ),
};

export const Error: Story = {
  render: () => (
    <CheckboxField
      label="אישור תנאי השימוש"
      error="חובה לאשר את תנאי השימוש לפני המשך."
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <CheckboxField
      defaultChecked
      disabled
      label="חיוב חודשי אוטומטי (זמין לאחר אימות חשבון)"
    />
  ),
};

export const English: Story = {
  name: "LTR — English",
  globals: { direction: "ltr" },
  render: () => (
    <CheckboxField
      label="Remember me on this device"
      hint="We'll keep you signed in for 30 days."
    />
  ),
};

export const SignupTerms: Story = {
  name: "Composition — signup student form with terms",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/signup.html` — the \"פרטי הסטודנט/ית\" form section. Reproduces name + email + password fields and the terms-acceptance checkbox shown at the bottom of the mock. Real labels and submit copy from the mock (\"צרו חשבון →\").",
      },
    },
  },
  render: () => {
    const Wrapper = () => {
      const [accepted, setAccepted] = useState(false);
      const [submitted, setSubmitted] = useState(false);
      return (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>פרטי הסטודנט/ית</CardTitle>
          </CardHeader>
          <CardBody>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(true);
              }}
            >
              <Input label="שם מלא" placeholder="ישראל ישראלי" required surface="linen" />
              <Input
                label="אימייל"
                type="email"
                placeholder="you@example.com"
                required
                surface="linen"
              />
              <Input
                label="סיסמה"
                type="password"
                placeholder="לפחות 8 תווים"
                required
                minLength={8}
                surface="linen"
              />
              <CheckboxField
                label={
                  <>
                    אני מאשר/ת את{" "}
                    <a href="#terms" className="text-primary-container underline">
                      תנאי השימוש
                    </a>
                  </>
                }
                checked={accepted}
                onCheckedChange={(v) => setAccepted(v === true)}
                error={submitted && !accepted ? "חובה לאשר את תנאי השימוש." : undefined}
              />
              <Button variant="primary" fullWidth size="lg" type="submit">
                צרו חשבון →
              </Button>
            </form>
          </CardBody>
        </Card>
      );
    };
    return <Wrapper />;
  },
};
