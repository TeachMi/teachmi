import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Avatar } from "./avatar";

const REAL_PHOTO =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=faces";

const meta = {
  title: "UI/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  args: {
    name: "נועה כהן",
  },
  argTypes: {
    size: { control: "inline-radio", options: ["xs", "sm", "md", "lg", "xl"] },
    ring: { control: "boolean" },
  },
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Default — with image",
  args: { src: REAL_PHOTO, name: "נועה כהן" },
};

export const Fallback: Story = {
  name: "Fallback — no image, initials",
  args: { name: "נועה כהן" },
};

export const Sizes: Story = {
  name: "Sizes (xs · sm · md · lg · xl)",
  render: () => (
    <div className="flex items-end gap-4">
      <Avatar size="xs" name="נועה כהן" />
      <Avatar size="sm" name="נועה כהן" />
      <Avatar size="md" name="נועה כהן" />
      <Avatar size="lg" name="נועה כהן" />
      <Avatar size="xl" name="נועה כהן" />
    </div>
  ),
};

export const WithRing: Story = {
  name: "WithRing (active speaker / selected)",
  args: { ring: true, src: REAL_PHOTO, size: "lg" },
};

export const Hebrew: Story = {
  name: "Hebrew initials — 'נועה כהן' → 'נכ'",
  args: { name: "נועה כהן", size: "lg" },
};

export const English: Story = {
  name: "Latin initials — 'Noa Cohen' → 'NC' (LTR)",
  globals: { direction: "ltr" },
  args: { name: "Noa Cohen", size: "lg" },
};

export const BrokenImage: Story = {
  name: "Broken image — falls back to initials",
  parameters: {
    docs: {
      description: {
        story:
          "Setting `src` to a 404 URL forces Radix's image-load failure path. After a short delay, the `<Avatar.Fallback>` (initials) renders.",
      },
    },
  },
  args: { src: "/missing.png", name: "ד״ר מיכל לוי", size: "lg" },
};

export const DashboardUserSlot: Story = {
  name: "Composition — dashboard top-nav user slot",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/dashboard.html` top-nav user slot — small initials avatar (`נ`) next to a notifications button with a tertiary-accent count badge. Mock uses a hand-rolled `<div>` with inline initials; this story drops in the design-system `Avatar` (size `sm`, no `src`, falls back to initials from the `name` prop).",
      },
    },
  },
  render: () => (
    <header className="bg-linen/95 backdrop-blur-md border-b border-linen-border w-full max-w-5xl">
      <div className="px-6 py-4 flex flex-row-reverse justify-between items-center">
        <div className="flex flex-row-reverse items-center gap-2">
          <span aria-hidden className="text-2xl font-bold text-primary-container">TeachMe</span>
        </div>
        <nav className="hidden md:flex flex-row-reverse items-center gap-8 text-sm font-bold">
          <a className="text-on-surface-variant hover:text-primary-container" href="#">בית</a>
          <a className="text-on-surface-variant hover:text-primary-container" href="#">חיפוש מורים</a>
          <a className="text-primary-container border-b-2 border-tertiary-accent pb-1" href="#">השיעורים שלי</a>
        </nav>
        <div className="flex flex-row-reverse items-center gap-3">
          <button
            type="button"
            aria-label="התראות (2 חדשות)"
            className="relative h-9 w-9 rounded-full bg-surface-lowest border border-linen-border flex items-center justify-center hover:border-primary-fixed-dim"
          >
            <svg
              viewBox="0 0 24 24"
              width="1em"
              height="1em"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <span
              aria-hidden
              className="absolute -top-1 start-0 h-4 w-4 rounded-full bg-tertiary-accent text-white text-[10px] font-bold flex items-center justify-center"
            >
              2
            </span>
          </button>
          <Avatar name="נועה" size="sm" className="bg-primary-container text-on-primary" />
        </div>
      </div>
    </header>
  ),
};
