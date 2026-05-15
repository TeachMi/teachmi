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
import { Input } from "./input";

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
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story:
          "Mirrors `mocks/browse.html` — the tutor result card grid. Photo + rating chip overlay, name + price, subject sub-label, availability tag, primary CTA. Real copy from the mock (`דניאל כהן`, `פסיכומטרי ומתמטיקה`, `זמין מחר 16:00`).",
      },
    },
  },
  render: () => (
    <Card padding="none" radius="xl" className="max-w-xs overflow-hidden">
      <div className="relative h-56 overflow-hidden bg-surface-high">
        <div className="absolute inset-0 flex items-center justify-center text-secondary text-xs">
          (תמונת המורה)
        </div>
        <div className="absolute top-3 end-3 bg-tertiary-fixed/95 backdrop-blur px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
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
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/signup.html` — the \"פרטי הסטודנט/ית\" student form section + matching `mocks/login.html` form-card pattern. Single Card with header + form body, primary submit CTA at the bottom.",
      },
    },
  },
  render: (args) => (
    <Card {...args} className="max-w-sm">
      <CardHeader>
        <CardTitle>פרטי הסטודנט/ית</CardTitle>
      </CardHeader>
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <Input label="שם מלא" placeholder="ישראל ישראלי" required />
        <Button variant="primary" fullWidth size="lg" type="submit">
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

export const TutorProfileHero: Story = {
  name: "Composition — tutor profile hero",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/tutor.html` (lines 59–135) — the two-column hero with profile photo, displayName, verified badge, headline subject, rating summary, lessons-completed pill, and the 45/60-min two-price card. Used on `/tutor/[slug]` (Story 3.2, FR18).",
      },
    },
  },
  render: () => (
    <Card className="max-w-5xl" padding="lg">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 text-start">
          <div className="flex items-start gap-5 mb-5">
            <div className="w-20 h-20 rounded-full bg-primary-fixed/30 flex items-center justify-center text-2xl font-extrabold text-primary-container border-4 border-white shadow-md">
              מ
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="font-display font-extrabold text-3xl text-primary-container">
                  ד״ר מיכל לוי
                </h1>
                <span className="bg-primary-fixed text-primary-container text-xs px-2 py-0.5 rounded-full font-bold">
                  ✓ מורה מאומתת
                </span>
              </div>
              <p className="text-on-surface-variant mb-3">
                מומחית למתמטיקה — 5 יחידות
              </p>
              <div className="flex items-center gap-4 text-sm">
                <span className="font-bold">★ 4.9</span>
                <span className="text-secondary">(124 ביקורות)</span>
                <span className="text-secondary">·</span>
                <span className="text-secondary">1,240 שיעורים</span>
              </div>
            </div>
          </div>
          <div className="bg-linen border border-linen-border rounded-xl p-4 flex gap-6">
            <div className="text-start">
              <div className="text-xs text-secondary mb-1">שיעור 45 דק׳</div>
              <div className="font-display font-bold text-2xl text-primary-container">
                ₪140
              </div>
            </div>
            <div className="w-px bg-linen-border" />
            <div className="text-start">
              <div className="text-xs text-secondary mb-1">שיעור 60 דק׳</div>
              <div className="font-display font-bold text-2xl text-primary-container">
                ₪180
              </div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="aspect-video rounded-2xl bg-on-surface/10 flex items-center justify-center">
            <span className="text-sm text-secondary">סרטון היכרות</span>
          </div>
        </div>
      </div>
    </Card>
  ),
};

export const TutorPriceBlock: Story = {
  name: "Composition — tutor price block (45/60)",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/tutor.html` (lines 94–109) — the two-price tile (45 דק׳ / 60 דק׳) used on the public tutor profile page (Story 3.2, FR18). The mock includes a third 'package of 10' tile which is explicitly omitted — packages are Phase-2+ per locked product constraints.",
      },
    },
  },
  render: () => (
    <Card padding="md" className="max-w-md">
      <div className="bg-linen border border-linen-border rounded-xl p-4 flex gap-6">
        <div className="text-start">
          <div className="text-xs text-secondary mb-1">שיעור 45 דק׳</div>
          <div className="font-display font-bold text-2xl text-primary-container">
            ₪140
          </div>
        </div>
        <div className="w-px bg-linen-border" />
        <div className="text-start">
          <div className="text-xs text-secondary mb-1">שיעור 60 דק׳</div>
          <div className="font-display font-bold text-2xl text-primary-container">
            ₪180
          </div>
        </div>
      </div>
    </Card>
  ),
};

export const HomepageSubjectCard: Story = {
  name: "Composition — homepage subject card",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/landing.html` (lines 231–258) — the headline-four subject card used on the marketplace homepage (Story 3.1, FR17). One of four cards rendered in a single row above the fold; each links to `/browse?subject=<slug>`. The mock includes a tutor-count chip ('1,200+ מורים') which is explicitly omitted from Story 3.1 — those numbers are aspirational at closed-beta scale.",
      },
    },
  },
  render: () => (
    <Card padding="md" interactive className="max-w-xs text-start">
      <div className="mb-3 flex items-center justify-start">
        <span className="material-symbols-outlined text-3xl text-primary-container">
          calculate
        </span>
      </div>
      <h3 className="font-display text-xl font-bold text-primary-container">
        מתמטיקה
      </h3>
    </Card>
  ),
};

export const TutorProfileEditReapprovalWarning: Story = {
  name: "Composition — tutor profile edit (re-approval warning)",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/tutor-profile-editor.html` (lines 49–53, 86–101) — the re-approval warning banner that appears at the top of the tutor profile edit page (Story 2.5, FR14), plus a representative section card with the inline 'דורש אישור מחדש' badge. Surfaces only in `mode='edit'`; create-mode (Story 2.1) does not render either element.",
      },
    },
  },
  render: () => (
    <div className="space-y-5 max-w-3xl">
      <Card
        tone="highlighted"
        className="border border-tertiary-fixed bg-tertiary-fixed/30 text-start"
      >
        <p className="text-xs text-on-tertiary-fixed-variant">
          <strong>שימו לב:</strong> שינוי בסרטון, במחיר או במקצועות יסיר את הפרופיל מהאוויר עד אישור הצוות (~24 שעות).
        </p>
      </Card>
      <Card padding="md" className="text-start">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-primary-container">
            תמחור — 2 אורכי שיעור
          </h3>
          <span className="text-xs bg-tertiary-fixed/40 text-on-tertiary-fixed-variant px-2 py-0.5 rounded font-bold">
            דורש אישור מחדש
          </span>
        </div>
        <p className="text-xs text-secondary">
          שינוי במחיר ידרוש בדיקה מחודשת של הצוות לפני שיוצג שוב לסטודנטים.
        </p>
      </Card>
    </div>
  ),
};
