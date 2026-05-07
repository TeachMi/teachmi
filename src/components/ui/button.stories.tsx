import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button";

const ArrowEnd = () => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="rtl:-scale-x-100"
  >
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
);

const Plus = () => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const SearchIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const GoogleGlyph = () => (
  <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
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
      options: ["primary", "outline", "accent", "ghost", "danger"],
    },
    size: {
      control: "inline-radio",
      options: ["sm", "md", "lg"],
    },
    fullWidth: { control: "boolean" },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// Variants — every option from the cva config gets a dedicated story.

export const Primary: Story = {
  args: { variant: "primary", children: "הזמינו שיעור" },
};

export const Outline: Story = {
  name: "Outline (Sign in with Google)",
  args: {
    variant: "outline",
    iconLeading: <GoogleGlyph />,
    children: "התחברו עם Google",
    fullWidth: true,
  },
  render: (args) => (
    <div className="max-w-sm">
      <Button {...args} />
    </div>
  ),
};

export const Accent: Story = {
  name: "Accent — recruitment / wedge CTA",
  args: {
    variant: "accent",
    size: "lg",
    children: "הצטרפו כמורה",
  },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "פרטים נוספים" },
};

export const Danger: Story = {
  args: { variant: "danger", children: "מחיקת חשבון" },
};

// Sizes

export const SizeSmall: Story = {
  args: { size: "sm", children: "קטן" },
};

export const SizeMedium: Story = {
  args: { size: "md", children: "רגיל (header CTA)" },
};

export const SizeLarge: Story = {
  args: { size: "lg", children: "גדול (Hero)" },
};

// States

export const Disabled: Story = {
  args: { disabled: true, children: "לא זמין" },
};

export const Loading: Story = {
  args: { loading: true, children: "שומר…" },
};

export const FullWidth: Story = {
  name: "Full-width (form submit)",
  args: { fullWidth: true, size: "lg", children: "צרו חשבון", iconTrailing: <ArrowEnd /> },
  render: (args) => (
    <div className="max-w-sm">
      <Button {...args} />
    </div>
  ),
};

// Icons

export const IconLeading: Story = {
  name: "Icon — leading",
  args: {
    iconLeading: <Plus />,
    children: "הוספת שיעור",
  },
};

export const IconTrailing: Story = {
  name: "Icon — trailing (arrow flips in RTL)",
  args: {
    iconTrailing: <ArrowEnd />,
    children: "המשך",
  },
};

export const HeroSearch: Story = {
  name: "Hero search button (landing.html)",
  args: {
    iconLeading: <SearchIcon />,
    children: "חפשו מורה",
    size: "lg",
  },
};

export const AsChildLink: Story = {
  name: "asChild — render as <a> / Next.js <Link>",
  args: {
    asChild: true,
    variant: "accent",
    size: "lg",
    children: <a href="#">חפשו מורה</a>,
  },
};

// Catalog

export const AllVariants: Story = {
  name: "Catalog — variants × sizes",
  render: () => (
    <div className="flex flex-col gap-4">
      {(["primary", "outline", "accent", "ghost", "danger"] as const).map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-3">
          <span className="w-24 shrink-0 text-sm font-bold text-on-surface-variant">
            {variant}
          </span>
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
