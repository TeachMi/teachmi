import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card, CardBody, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { Button } from "./button";

const meta = {
  title: "UI/Card",
  component: Card,
  tags: ["autodocs"],
  argTypes: {
    tone: { control: "inline-radio", options: ["default", "error"] },
    padding: { control: "inline-radio", options: ["none", "sm", "md", "lg"] },
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
        <CardDescription>מתמטיקה · חמש יחידות · 5★ (24 ביקורות)</CardDescription>
      </CardHeader>
      <CardBody>
        מורה מנוסה לתלמידי תיכון לקראת בגרות במתמטיקה. שיעורים פרונטליים בלבד.
      </CardBody>
      <CardFooter>
        <Button variant="primary" size="sm">
          הזמנת שיעור
        </Button>
        <Button variant="ghost" size="sm">
          לפרופיל המלא
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const Interactive: Story = {
  args: { interactive: true },
  render: (args) => (
    <Card {...args} role="button" tabIndex={0} className="max-w-md">
      <CardHeader>
        <CardTitle>אנגלית מדוברת</CardTitle>
        <CardDescription>5 מורים זמינים השבוע</CardDescription>
      </CardHeader>
      <CardBody>לחץ לראות את כל המורים.</CardBody>
    </Card>
  ),
};

export const Error: Story = {
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
    </Card>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, interactive: true },
  render: (args) => (
    <Card {...args} role="button" tabIndex={-1} className="max-w-md">
      <CardHeader>
        <CardTitle>שיעור שאינו זמין</CardTitle>
        <CardDescription>תאריך זה כבר עבר</CardDescription>
      </CardHeader>
      <CardBody>בחר תאריך אחר מהיומן.</CardBody>
    </Card>
  ),
};

export const PaddingNone: Story = {
  name: "Padding — none",
  args: { padding: "none" },
  render: (args) => (
    <Card {...args} className="max-w-md overflow-hidden">
      <div className="bg-primary-container px-6 py-3 text-on-primary">כותרת ללא ריפוד</div>
      <div className="p-6 text-sm text-on-surface">
        ה-Card נטול ריפוד מאפשר עיצוב פנימי מותאם, לדוגמה כותרת עם רקע מודגש.
      </div>
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
      <CardBody>Experienced tutor for high-school Bagrut prep in mathematics.</CardBody>
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
