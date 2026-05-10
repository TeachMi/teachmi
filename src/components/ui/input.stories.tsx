import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "./input";
import { Card, CardBody } from "./card";

const meta = {
  title: "UI/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    label: "אימייל",
    placeholder: "you@example.com",
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
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  name: "With hint (signup form)",
  args: {
    label: "סיסמה",
    type: "password",
    placeholder: "לפחות 8 תווים",
    hint: "צירוף של אותיות, ספרות ותווים מיוחדים מומלץ.",
  },
};

export const Error: Story = {
  args: {
    defaultValue: "noa@bad",
    error: "כתובת אימייל לא תקינה.",
  },
};

export const Disabled: Story = {
  args: {
    defaultValue: "noa@teachme.app",
    disabled: true,
    hint: "כתובת מקושרת לחשבון Google שלך — לא ניתן לערוך.",
  },
};

export const SizeSmall: Story = { args: { size: "sm" } };
export const SizeMedium: Story = { args: { size: "md" } };
export const SizeLarge: Story = { args: { size: "lg" } };

export const SurfaceLinen: Story = {
  name: "Surface — linen (signup.html flat-on-page)",
  args: {
    surface: "linen",
    label: "שם מלא",
    placeholder: "ישראל ישראלי",
  },
  render: (args) => (
    <div className="bg-linen p-6 rounded-2xl max-w-md">
      <Input {...args} />
    </div>
  ),
};

export const SurfaceWhite: Story = {
  name: "Surface — white (login.html on-card)",
  args: {
    surface: "white",
    label: "אימייל",
    placeholder: "you@example.com",
  },
  render: (args) => (
    <div className="bg-linen p-6 rounded-2xl max-w-md">
      <div className="bg-white border border-linen-border rounded-2xl p-6">
        <Input {...args} />
      </div>
    </div>
  ),
};

export const HebrewName: Story = {
  name: "RTL — Hebrew",
  args: {
    label: "שם מלא",
    placeholder: "ישראל ישראלי",
    hint: "השם שיופיע בפרופיל שלך.",
  },
};

export const English: Story = {
  name: "LTR — English",
  globals: { direction: "ltr" },
  args: {
    label: "Full name",
    placeholder: "John Doe",
    hint: "The name shown on your profile.",
  },
};

export const LoginForm: Story = {
  name: "Composition — login form",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/login.html` — email + password fields stacked inside a white card on the linen background. Real placeholder copy from the mock.",
      },
    },
  },
  render: () => (
    <Card radius="2xl" className="max-w-sm">
      <CardBody>
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Input label="אימייל" type="email" placeholder="you@example.com" required />
          <Input label="סיסמה" type="password" placeholder="••••••••" required />
        </form>
      </CardBody>
    </Card>
  ),
};
