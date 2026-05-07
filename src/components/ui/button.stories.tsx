import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button";

const ArrowEnd = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
);

const Plus = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const meta = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    children: "המשך",
  },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["primary", "secondary", "ghost", "danger"],
    },
    size: {
      control: "inline-radio",
      options: ["sm", "md", "lg"],
    },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Primary: Story = {
  args: { variant: "primary", children: "התחל ללמד" },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "ביטול" },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "פרטים נוספים" },
};

export const Danger: Story = {
  args: { variant: "danger", children: "מחיקה" },
};

export const SizeSmall: Story = {
  args: { size: "sm", children: "קטן" },
};

export const SizeMedium: Story = {
  args: { size: "md", children: "רגיל" },
};

export const SizeLarge: Story = {
  args: { size: "lg", children: "גדול" },
};

export const Disabled: Story = {
  args: { disabled: true, children: "לא זמין" },
};

export const Loading: Story = {
  args: { loading: true, children: "שומר…" },
};

export const IconLeading: Story = {
  name: "Icon — leading",
  args: {
    iconLeading: <Plus />,
    children: "הוספת שיעור",
  },
};

export const IconTrailing: Story = {
  name: "Icon — trailing",
  args: {
    iconTrailing: <ArrowEnd />,
    children: "המשך",
  },
};

export const AllVariants: Story = {
  name: "Catalog — all variants × sizes",
  render: () => (
    <div className="flex flex-col gap-4">
      {(["primary", "secondary", "ghost", "danger"] as const).map((variant) => (
        <div key={variant} className="flex items-center gap-3">
          <span className="w-24 text-sm font-bold text-on-surface-variant">{variant}</span>
          <Button variant={variant} size="sm">
            קטן
          </Button>
          <Button variant={variant} size="md">
            רגיל
          </Button>
          <Button variant={variant} size="lg">
            גדול
          </Button>
        </div>
      ))}
    </div>
  ),
};
