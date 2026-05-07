import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
import { Button } from "./button";

const meta = {
  title: "UI/Card",
  component: Card,
  tags: ["autodocs"],
  argTypes: {
    tone: { control: "inline-radio", options: ["default", "highlighted", "success", "error"] },
    radius: { control: "inline-radio", options: ["lg", "xl", "2xl"] },
    padding: { control: "inline-radio", options: ["none", "sm", "md", "lg"] },
    shadow: { control: "inline-radio", options: ["none", "sm", "md", "lg"] },
    interactive: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="max-w-md">
      <CardHeader>
        <CardTitle>נועה כהן</CardTitle>
        <CardDescription>מתמטיקה · חמש יחידות</CardDescription>
      </CardHeader>
      <CardBody>
        מורה מנוסה לתלמידי תיכון לקראת בגרות במתמטיקה. שיעורים אונליין בלבד.
      </CardBody>
      <CardFooter>
        <Button variant="primary" size="sm" fullWidth>
          הזמינו שיעור
        </Button>
      </CardFooter>
    </Card>
  ),
};

// Tone variants

export const Highlighted: Story = {
  name: "Highlighted (booking summary)",
  args: { tone: "highlighted", shadow: "sm" },
  render: (args) => (
    <Card {...args} className="max-w-sm">
      <CardHeader>
        <CardTitle>סיכום הזמנה</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2">
        <div className="flex justify-between">
          <span className="text-secondary">מורה</span>
          <span className="font-bold">ד״ר מיכל לוי</span>
        </div>
        <div className="flex justify-between">
          <span className="text-secondary">תאריך</span>
          <span className="font-bold">ד׳ — 6.5 · 16:00</span>
        </div>
        <div className="flex justify-between border-t border-linen-border pt-2 mt-2">
          <span className="text-secondary">סה״כ לתשלום</span>
          <span className="font-bold text-primary-container">₪180</span>
        </div>
      </CardBody>
      <CardFooter>
        <Button variant="primary" fullWidth>
          אשרו והזמינו
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const Success: Story = {
  name: "Success callout (reset link sent)",
  args: { tone: "success", radius: "lg", padding: "md" },
  render: (args) => (
    <Card {...args} className="max-w-sm text-center">
      <p className="font-bold text-primary-container">קישור איפוס נשלח!</p>
      <p className="text-xs text-on-surface-variant mt-1">
        בדקו את תיבת האימייל שלכם.
      </p>
    </Card>
  ),
};

export const Error: Story = {
  name: "Error (payment failed)",
  args: { tone: "error" },
  render: (args) => (
    <Card {...args} className="max-w-md">
      <CardHeader>
        <CardTitle>תשלום נכשל</CardTitle>
        <CardDescription>לא הצלחנו לחייב את האמצעי השמור</CardDescription>
      </CardHeader>
      <CardBody>
        ניתן לעדכן את אמצעי התשלום ולנסות שוב. השיעור עדיין שמור עבורך 30 דקות.
      </CardBody>
      <CardFooter>
        <Button variant="primary" size="sm">
          עדכון אמצעי תשלום
        </Button>
        <Button variant="ghost" size="sm">
          ביטול
        </Button>
      </CardFooter>
    </Card>
  ),
};

// State variants

export const Interactive: Story = {
  args: { interactive: true, radius: "xl" },
  render: (args) => (
    <Card {...args} role="button" tabIndex={0} className="max-w-sm">
      <CardHeader>
        <CardTitle>אנגלית מדוברת</CardTitle>
        <CardDescription>5 מורים זמינים השבוע</CardDescription>
      </CardHeader>
      <CardBody>לחצו לראות את כל המורים.</CardBody>
    </Card>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, interactive: true },
  render: (args) => (
    <Card {...args} role="button" tabIndex={-1} className="max-w-sm">
      <CardHeader>
        <CardTitle>שיעור שאינו זמין</CardTitle>
        <CardDescription>תאריך זה כבר עבר</CardDescription>
      </CardHeader>
      <CardBody>בחרו תאריך אחר מהיומן.</CardBody>
    </Card>
  ),
};

// Real-world compositions

export const TutorCard: Story = {
  name: "Composition — tutor card (browse / featured)",
  parameters: { layout: "padded" },
  render: () => (
    <Card padding="none" radius="xl" className="max-w-xs overflow-hidden">
      <div className="relative h-56 overflow-hidden bg-surface-high">
        <div className="absolute inset-0 flex items-center justify-center text-secondary text-xs">
          (תמונת המורה)
        </div>
        <div className="absolute top-3 right-3 bg-tertiary-fixed/95 backdrop-blur px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
          <span aria-hidden>★</span>
          <span>4.9</span>
        </div>
      </div>
      <div className="p-5 text-start">
        <div className="flex justify-between items-start mb-1">
          <h4 className="font-display font-bold text-primary-container">דניאל כהן</h4>
          <span className="font-bold text-primary-container">₪160</span>
        </div>
        <p className="text-secondary text-sm mb-4">פסיכומטרי ומתמטיקה</p>
        <div className="bg-primary-fixed/30 text-primary-container text-xs px-2 py-1 rounded inline-block mb-4">
          זמין מחר 16:00
        </div>
        <Button variant="primary" fullWidth>
          הזמינו שיעור
        </Button>
      </div>
    </Card>
  ),
};

export const FormSection: Story = {
  name: "Composition — form section card (signup / login)",
  args: { radius: "2xl", padding: "md" },
  render: (args) => (
    <Card {...args} className="max-w-sm">
      <CardHeader>
        <CardTitle>פרטי הסטודנט/ית</CardTitle>
      </CardHeader>
      <form className="space-y-4 text-start" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label className="block text-sm font-bold mb-1.5">שם מלא</label>
          <input
            type="text"
            placeholder="ישראל ישראלי"
            className="w-full border border-linen-border rounded-lg px-4 py-3 bg-surface-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed-dim"
          />
        </div>
        <Button variant="primary" fullWidth size="lg">
          צרו חשבון
        </Button>
      </form>
    </Card>
  ),
};

export const English: Story = {
  name: "LTR — English",
  globals: { direction: "ltr" },
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Noa Cohen</CardTitle>
        <CardDescription>Mathematics · Five-unit · 5★ (24 reviews)</CardDescription>
      </CardHeader>
      <CardBody>
        Experienced tutor for high-school Bagrut prep in mathematics.
      </CardBody>
      <CardFooter>
        <Button variant="primary" size="sm">
          Book a lesson
        </Button>
        <Button variant="ghost" size="sm">
          View profile
        </Button>
      </CardFooter>
    </Card>
  ),
};
