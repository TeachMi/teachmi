import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "./input";

const meta = {
  title: "UI/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    label: "אימייל",
    placeholder: "name@example.com",
  },
  argTypes: {
    tone: {
      control: "inline-radio",
      options: ["default", "error"],
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
  args: { hint: "נשתמש בכתובת זו רק לכניסה למערכת." },
};

export const Error: Story = {
  args: {
    defaultValue: "שגיאה",
    error: "כתובת אימייל לא תקינה.",
  },
};

export const Disabled: Story = {
  args: {
    defaultValue: "noa@teachme.app",
    disabled: true,
  },
};

export const SizeSmall: Story = { args: { size: "sm" } };
export const SizeMedium: Story = { args: { size: "md" } };
export const SizeLarge: Story = { args: { size: "lg" } };

export const Hebrew: Story = {
  name: "RTL — Hebrew text",
  args: {
    label: "שם מלא",
    placeholder: "ישראל ישראלי",
    hint: "השם שיופיע בפרופיל שלך.",
  },
};

export const English: Story = {
  name: "LTR — English text",
  globals: { direction: "ltr" },
  args: {
    label: "Full name",
    placeholder: "John Doe",
    hint: "The name shown on your profile.",
  },
};
