import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

const meta = {
  title: "UI/Select",
  component: SelectTrigger,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Single-select dropdown wrapping Radix UI's Select primitive. Multi-select / search Combobox is intentionally out of scope — see TODO in `select.tsx`. Real consumer (Story 3.4 browse-and-filter) drives that API.",
      },
    },
  },
  argTypes: {
    tone: { control: "inline-radio", options: ["default", "error"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof SelectTrigger>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Default — subject picker",
  render: (args) => (
    <div className="max-w-xs">
      <Select>
        <SelectTrigger {...args} aria-label="בחרו מקצוע">
          <SelectValue placeholder="בחרו מקצוע…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="math">מתמטיקה</SelectItem>
          <SelectItem value="english">אנגלית</SelectItem>
          <SelectItem value="hebrew">עברית / לשון</SelectItem>
          <SelectItem value="psychometric">פסיכומטרי</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const WithGroups: Story = {
  name: "With groups (subjects by category)",
  render: (args) => (
    <div className="max-w-xs">
      <Select>
        <SelectTrigger {...args} aria-label="בחרו מקצוע">
          <SelectValue placeholder="בחרו מקצוע…" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>מקצועות ליבה</SelectLabel>
            <SelectItem value="math">מתמטיקה</SelectItem>
            <SelectItem value="english">אנגלית</SelectItem>
            <SelectItem value="hebrew">עברית / לשון</SelectItem>
            <SelectItem value="psychometric">פסיכומטרי</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>מקצועות נוספים</SelectLabel>
            <SelectItem value="statistics">סטטיסטיקה</SelectItem>
            <SelectItem value="accounting">חשבונאות</SelectItem>
            <SelectItem value="economics">כלכלה</SelectItem>
            <SelectItem value="cs">מדעי המחשב</SelectItem>
            <SelectItem value="physics">פיזיקה</SelectItem>
            <SelectItem value="chemistry">כימיה</SelectItem>
            <SelectItem value="biology">ביולוגיה</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const Error: Story = {
  render: (args) => (
    <div className="max-w-xs flex flex-col gap-1.5">
      <label className="text-sm font-bold text-on-surface">מקצוע</label>
      <Select>
        <SelectTrigger {...args} tone="error" aria-label="מקצוע — שדה חובה">
          <SelectValue placeholder="בחרו מקצוע…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="math">מתמטיקה</SelectItem>
          <SelectItem value="english">אנגלית</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs font-bold text-danger" role="alert">
        חובה לבחור מקצוע.
      </p>
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="max-w-xs">
      <Select disabled defaultValue="math">
        <SelectTrigger {...args} aria-label="מקצוע — נעול">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="math">מתמטיקה</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const LongList: Story = {
  name: "Long list (10+ items, scroll behaviour)",
  render: (args) => (
    <div className="max-w-xs">
      <Select>
        <SelectTrigger {...args} aria-label="בחרו עיר">
          <SelectValue placeholder="בחרו עיר…" />
        </SelectTrigger>
        <SelectContent>
          {[
            "תל אביב",
            "ירושלים",
            "חיפה",
            "ראשון לציון",
            "פתח תקווה",
            "אשדוד",
            "נתניה",
            "באר שבע",
            "בני ברק",
            "חולון",
            "רמת גן",
            "אשקלון",
            "רחובות",
            "בת ים",
            "כפר סבא",
          ].map((city) => (
            <SelectItem key={city} value={city}>
              {city}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
};

export const English: Story = {
  name: "LTR — English",
  globals: { direction: "ltr" },
  render: (args) => (
    <div className="max-w-xs">
      <Select>
        <SelectTrigger {...args} aria-label="Choose subject">
          <SelectValue placeholder="Choose a subject…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="math">Mathematics</SelectItem>
          <SelectItem value="english">English</SelectItem>
          <SelectItem value="hebrew">Hebrew / Lashon</SelectItem>
          <SelectItem value="psychometric">Psychometric</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const FilterRow: Story = {
  name: "Composition — browse filter bar (subject + sort)",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/browse.html` sticky filter bar — the two `<select>` widgets (subject + sort) reproduced with the design-system `Select`. Live-count text matches the mock copy (\"47 מורים זמינים\"). The price-range / day-picker / duration-toggle widgets in the mock use other primitives (range slider, button group, button group) and aren't part of this story.",
      },
    },
  },
  render: () => (
    <div className="bg-linen border-y border-linen-border px-6 py-3 max-w-4xl">
      <div className="flex flex-row-reverse items-center gap-3 flex-wrap">
        <div className="bg-surface-lowest border border-linen-border rounded-lg px-3 py-1.5 flex flex-row-reverse items-center gap-2">
          <span className="text-[11px] text-secondary">מקצוע</span>
          <Select defaultValue="math">
            <SelectTrigger
              size="sm"
              aria-label="מקצוע"
              className="border-0 px-1 h-7 font-bold text-primary-container w-auto"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="math">מתמטיקה</SelectItem>
              <SelectItem value="english">אנגלית</SelectItem>
              <SelectItem value="hebrew">לשון</SelectItem>
              <SelectItem value="psychometric">פסיכומטרי</SelectItem>
              <SelectItem value="physics">פיזיקה</SelectItem>
              <SelectItem value="chemistry">כימיה</SelectItem>
              <SelectItem value="biology">ביולוגיה</SelectItem>
              <SelectItem value="cs">מדעי המחשב</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-row-reverse items-center gap-2 me-auto text-sm text-on-surface-variant">
          <span className="text-primary-container font-bold">47</span>
          <span>מורים זמינים</span>
        </div>

        <div className="flex flex-row-reverse items-center gap-2">
          <label className="text-[11px] text-secondary">מיין לפי</label>
          <Select defaultValue="relevance">
            <SelectTrigger size="sm" aria-label="מיין לפי" className="font-bold text-primary-container">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">רלוונטיות</SelectItem>
              <SelectItem value="price-asc">מחיר נמוך לגבוה</SelectItem>
              <SelectItem value="rating">דירוג</SelectItem>
              <SelectItem value="availability">זמינות הכי קרובה</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  ),
};
