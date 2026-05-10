import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { RadioGroup, RadioGroupItem } from "./radio";
import { Button } from "./button";

const meta = {
  title: "UI/Radio",
  component: RadioGroup,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Radio group + item compound. RadioGroup provides arrow-key navigation between items (↑/↓ or ←/→ depending on direction). Use the Radix-standard pattern: a `RadioGroup` wrapper with `RadioGroupItem` children, each labelled with a sibling `<label htmlFor>`.",
      },
    },
  },
  argTypes: {
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

const RoleOptions = ({ disabledItem }: { disabledItem?: string } = {}) => (
  <>
    {[
      { value: "student", label: "סטודנט/ית" },
      { value: "parent", label: "הורה" },
      { value: "tutor", label: "מורה" },
    ].map(({ value, label }) => (
      <label
        key={value}
        htmlFor={`role-${value}`}
        className="flex items-center gap-2.5 text-sm text-on-surface cursor-pointer select-none"
      >
        <RadioGroupItem
          id={`role-${value}`}
          value={value}
          disabled={disabledItem === value}
        />
        <span>{label}</span>
      </label>
    ))}
  </>
);

export const Default: Story = {
  name: "Default — role picker (3 options)",
  render: (args) => (
    <RadioGroup defaultValue="student" {...args}>
      <RoleOptions />
    </RadioGroup>
  ),
};

export const Selected: Story = {
  name: "Selected — tutor",
  render: (args) => (
    <RadioGroup defaultValue="tutor" {...args}>
      <RoleOptions />
    </RadioGroup>
  ),
};

export const WithHint: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 max-w-md">
      <p className="text-sm font-bold text-on-surface">איך אתם רוצים להירשם?</p>
      <RadioGroup defaultValue="student" {...args}>
        <RoleOptions />
      </RadioGroup>
      <p className="text-xs text-on-surface-variant">
        בחירת התפקיד תקבע אילו תכונות תראו אחרי ההרשמה.
      </p>
    </div>
  ),
};

export const Error: Story = {
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState("");
      const [submitted, setSubmitted] = useState(false);
      const showError = submitted && value === "";
      return (
        <form
          className="flex flex-col gap-3 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
        >
          <p className="text-sm font-bold text-on-surface">איך אתם רוצים להירשם?</p>
          <RadioGroup
            value={value}
            onValueChange={setValue}
            aria-invalid={showError ? true : undefined}
          >
            <RoleOptions />
          </RadioGroup>
          {showError && (
            <p className="text-xs font-bold text-danger" role="alert">
              חובה לבחור תפקיד.
            </p>
          )}
          <Button variant="primary" type="submit">
            המשך
          </Button>
        </form>
      );
    };
    return <Wrapper />;
  },
};

export const Disabled: Story = {
  render: () => (
    <RadioGroup defaultValue="student" disabled>
      <RoleOptions />
    </RadioGroup>
  ),
};

export const Vertical: Story = {
  name: "Vertical (default)",
  render: () => (
    <RadioGroup defaultValue="student">
      <RoleOptions />
    </RadioGroup>
  ),
};

export const Horizontal: Story = {
  name: "Horizontal — card layout (signup role picker)",
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState("student");
      const options: Array<{ value: string; title: string; description: string }> = [
        {
          value: "student",
          title: "סטודנט/ית",
          description: "מחפש/ת מורה לשיעורים פרטיים.",
        },
        {
          value: "parent",
          title: "הורה",
          description: "אני מזמין/ה שיעורים עבור ילדי.",
        },
        {
          value: "tutor",
          title: "מורה",
          description: "מלמד/ת ורוצה להצטרף לפלטפורמה.",
        },
      ];
      return (
        <RadioGroup
          value={value}
          onValueChange={setValue}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          {options.map((opt) => {
            const id = `card-${opt.value}`;
            const isActive = value === opt.value;
            return (
              <label
                key={opt.value}
                htmlFor={id}
                className={
                  "flex flex-col gap-2 rounded-xl border-2 bg-surface-lowest p-4 cursor-pointer transition-colors " +
                  (isActive
                    ? "border-primary-container bg-primary-fixed/30"
                    : "border-linen-border hover:border-primary-fixed-dim")
                }
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id={id} value={opt.value} />
                  <span className="font-bold text-on-surface">{opt.title}</span>
                </div>
                <span className="text-xs text-on-surface-variant">{opt.description}</span>
              </label>
            );
          })}
        </RadioGroup>
      );
    };
    return <Wrapper />;
  },
};

export const English: Story = {
  name: "LTR — English",
  globals: { direction: "ltr" },
  render: () => (
    <RadioGroup defaultValue="student">
      {[
        { value: "student", label: "Student" },
        { value: "parent", label: "Parent" },
        { value: "tutor", label: "Tutor" },
      ].map(({ value, label }) => (
        <div key={value} className="flex items-center gap-2.5">
          <RadioGroupItem id={`en-${value}`} value={value} />
          <label
            htmlFor={`en-${value}`}
            className="text-sm text-on-surface cursor-pointer select-none"
          >
            {label}
          </label>
        </div>
      ))}
    </RadioGroup>
  ),
};

export const SignupRolePicker: Story = {
  name: "Composition — signup role picker (value-prop cards)",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/signup.html` — the role-selector at the top of the page. Two large cards (סטודנט/ית · מורה) each with title, sub-label, and a 3-bullet value prop. The active card has the `primary-container` border + `primary-fixed/30` tint per the mock's `.role-card.active` style. Bullet copy is verbatim from the mock.",
      },
    },
  },
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState("student");
      const options: Array<{
        value: string;
        title: string;
        subtitle: string;
        bullets: string[];
      }> = [
        {
          value: "student",
          title: "אני סטודנט/ית",
          subtitle: "מחפש/ת מורה",
          bullets: [
            "חיפוש מורים מומחים",
            "קביעת שיעורים בלחיצה",
            "חשבונית מס לכל שיעור",
          ],
        },
        {
          value: "tutor",
          title: "אני מורה",
          subtitle: "רוצה ללמד",
          bullets: [
            "פתיחת תיק עוסק זעיר ב-30 דקות",
            "עמלה הוגנת — אתם קובעים מחיר",
            "חשבוניות אוטומטיות",
          ],
        },
      ];
      return (
        <div className="max-w-3xl">
          <div className="text-center mb-6">
            <h2 className="font-display font-extrabold text-2xl text-primary-container mb-1">
              ברוכים הבאים ל-TeachMe
            </h2>
            <p className="text-sm text-on-surface-variant">בואו נתחיל. למה אתם מצטרפים?</p>
          </div>
          <RadioGroup
            value={value}
            onValueChange={setValue}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {options.map((opt) => {
              const id = `signup-${opt.value}`;
              const isActive = value === opt.value;
              return (
                <label
                  key={opt.value}
                  htmlFor={id}
                  className={
                    "block bg-surface-lowest rounded-2xl border-2 p-6 cursor-pointer hover:shadow-lg transition-all " +
                    (isActive
                      ? "border-primary-container bg-primary-fixed/30 scale-[1.02]"
                      : "border-linen-border")
                  }
                >
                  <div className="flex items-center gap-3 mb-3">
                    <RadioGroupItem id={id} value={opt.value} />
                    <div className="flex-1">
                      <h3 className="font-display font-bold text-lg text-primary-container">
                        {opt.title}
                      </h3>
                      <p className="text-xs text-secondary">{opt.subtitle}</p>
                    </div>
                  </div>
                  <ul className="text-xs text-on-surface-variant space-y-1.5 leading-relaxed">
                    {opt.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-1.5">
                        <span aria-hidden className="text-primary-container shrink-0">✓</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </label>
              );
            })}
          </RadioGroup>
        </div>
      );
    };
    return <Wrapper />;
  },
};
