import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Badge } from "./badge";
import { Card, CardBody, CardHeader, CardTitle } from "./card";

const meta = {
  title: "UI/Badge",
  component: Badge,
  tags: ["autodocs"],
  args: { children: "תווית" },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: [
        "default",
        "subtle",
        "pending",
        "approved",
        "suspended",
        "rejected",
        "scheduled",
        "in-progress",
        "completed",
        "cancelled",
        "no-show",
        "subject",
        "count",
      ],
    },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { variant: "default", children: "ברירת מחדל" },
};

export const TutorStatus: Story = {
  name: "Tutor status (pending / approved / suspended / rejected)",
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="pending">ממתין לאישור</Badge>
      <Badge variant="approved">מאושר</Badge>
      <Badge variant="suspended">מושעה</Badge>
      <Badge variant="rejected">נדחה</Badge>
    </div>
  ),
};

export const LessonStatus: Story = {
  name: "Lesson status (scheduled / in-progress / completed / cancelled / no-show)",
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="scheduled">קבוע</Badge>
      <Badge variant="in-progress">בעיצומו</Badge>
      <Badge variant="completed">הסתיים</Badge>
      <Badge variant="cancelled">בוטל</Badge>
      <Badge variant="no-show">לא הופיע</Badge>
    </div>
  ),
};

export const Subject: Story = {
  name: "Subject (taxonomy chip)",
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="subject">מתמטיקה</Badge>
      <Badge variant="subject">אנגלית</Badge>
      <Badge variant="subject">לשון</Badge>
      <Badge variant="subject">פסיכומטרי</Badge>
      <Badge variant="subject">פיזיקה</Badge>
    </div>
  ),
};

export const FilterChip: Story = {
  name: "Filter chip (count + onRemove)",
  render: () => {
    const Wrapper = () => {
      const [filters, setFilters] = useState([
        "מתמטיקה",
        "אונליין",
        "תל אביב",
        "₪150-200",
      ]);
      return (
        <div className="flex flex-wrap items-center gap-2 max-w-md bg-white border border-linen-border rounded-lg p-3">
          <span className="text-xs font-bold text-on-surface-variant me-1">סינונים:</span>
          {filters.map((f) => (
            <Badge
              key={f}
              variant="count"
              onRemove={() => setFilters((prev) => prev.filter((x) => x !== f))}
              removeLabel={`הסר ${f}`}
            >
              {f}
            </Badge>
          ))}
          {filters.length === 0 && (
            <span className="text-xs text-on-surface-variant">אין סינונים פעילים.</span>
          )}
        </div>
      );
    };
    return <Wrapper />;
  },
};

export const Sizes: Story = {
  name: "Sizes (sm / md)",
  render: () => (
    <div className="flex items-center gap-3">
      <Badge variant="approved" size="sm">
        sm — מאושר
      </Badge>
      <Badge variant="approved" size="md">
        md — מאושר
      </Badge>
    </div>
  ),
};

export const English: Story = {
  name: "LTR — English",
  globals: { direction: "ltr" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="pending">Pending review</Badge>
      <Badge variant="approved">Approved</Badge>
      <Badge variant="scheduled">Scheduled</Badge>
      <Badge variant="completed">Completed</Badge>
      <Badge
        variant="count"
        onRemove={() => {}}
        removeLabel="Remove Mathematics filter"
      >
        Mathematics
      </Badge>
    </div>
  ),
};

export const InsideCard: Story = {
  name: "Composition — badges inside Card (next lesson)",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/dashboard.html` — the \"השיעור הבא\" hero card. Tutor name, status badge (\"קבוע\" — `scheduled`), subject chips, and lesson metadata. Real copy from the mock: ד״ר מיכל לוי · מתמטיקה · יום רביעי 6.5 16:00.",
      },
    },
  },
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>השיעור הבא</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold">ד״ר מיכל לוי</span>
          <Badge variant="scheduled">קבוע</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="subject">מתמטיקה</Badge>
          <Badge variant="subject">חמש יחידות</Badge>
          <Badge variant="subtle">60 דקות</Badge>
        </div>
        <p className="text-xs text-on-surface-variant">
          יום רביעי 6.5 · 16:00 · אונליין
        </p>
      </CardBody>
    </Card>
  ),
};
