import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import {
  Modal,
  ModalBody,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from "./modal";
import { Button } from "./button";
import { Card } from "./card";

const meta = {
  title: "UI/Modal",
  component: ModalContent,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Dialog modal wrapping Radix UI's Dialog primitive. Inherits Radix's defaults — try Tab / Shift+Tab inside an open modal to confirm focus stays trapped within. Press ESC to close. Click the backdrop to close. The Cancel-lesson `Danger` story mirrors `mocks/cancel-modal.html`.",
      },
    },
  },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
} satisfies Meta<typeof ModalContent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Standard confirmation modal. Tab / Shift+Tab cycles focus inside the modal — focus is trapped (Radix default). ESC closes. Click outside closes.",
      },
    },
  },
  render: () => (
    <Modal>
      <ModalTrigger asChild>
        <Button variant="primary">פתחו דיאלוג</Button>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>אישור פעולה</ModalTitle>
          <ModalDescription className="sr-only">
            דיאלוג אישור — בחרו ביטול או אישור.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <p>האם להמשיך עם הפעולה?</p>
        </ModalBody>
        <ModalFooter>
          <ModalClose asChild>
            <Button variant="primary">אישור</Button>
          </ModalClose>
          <ModalClose asChild>
            <Button variant="ghost">ביטול</Button>
          </ModalClose>
        </ModalFooter>
      </ModalContent>
    </Modal>
  ),
};

const CalendarIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="1.25em"
    height="1.25em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-primary-container"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18M9 16h.01M13 16h.01M9 20h.01M13 20h.01" />
  </svg>
);

const CancelIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="1.25em"
    height="1.25em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-danger"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="m4.93 4.93 14.14 14.14" />
  </svg>
);

export const Danger: Story = {
  name: "Danger — cancel-lesson (mirrors mocks/cancel-modal.html)",
  parameters: {
    docs: {
      description: {
        story:
          "Cancel-lesson flow. Action picks (reschedule recommended vs cancel-with-credit). Mirrors `mocks/cancel-modal.html`. Verify ESC closes, backdrop closes, and Tab cycles between the two action cards, the select, the textarea, and the footer buttons.",
      },
    },
  },
  render: () => {
    const Wrapper = () => {
      const [action, setAction] = useState<"reschedule" | "cancel">("reschedule");
      return (
        <Modal>
          <ModalTrigger asChild>
            <Button variant="danger">בטל / שנה מועד</Button>
          </ModalTrigger>
          <ModalContent>
            <ModalHeader tone="danger">
              <ModalTitle>ביטול או שינוי שיעור</ModalTitle>
              <ModalDescription className="sr-only">
                בחרו האם לדחות את השיעור למועד אחר או לבטל בזיכוי מלא.
              </ModalDescription>
            </ModalHeader>
            <ModalBody className="space-y-4">
              <Card padding="sm" className="bg-linen flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary-container/20 shrink-0" />
                <div className="flex-1 text-start">
                  <p className="font-bold text-sm">ד״ר מיכל לוי · מתמטיקה</p>
                  <p className="text-xs text-secondary">
                    יום רביעי 6.5 · 16:00 · 60 דק׳ · ₪180
                  </p>
                </div>
              </Card>
              <p className="text-sm font-bold">מה תרצו לעשות?</p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setAction("reschedule")}
                  className={
                    "w-full rounded-lg border-2 p-4 text-start transition-colors " +
                    (action === "reschedule"
                      ? "border-primary-container bg-primary-fixed/30"
                      : "border-linen-border hover:border-primary-fixed-dim")
                  }
                  aria-pressed={action === "reschedule"}
                >
                  <div className="flex items-start gap-3">
                    <CalendarIcon />
                    <div>
                      <p className="font-bold text-sm">דחיית שיעור (מומלץ)</p>
                      <p className="text-xs text-secondary">
                        בחרו מועד חדש. הזיכוי נשמר.
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAction("cancel")}
                  className={
                    "w-full rounded-lg border-2 p-4 text-start transition-colors " +
                    (action === "cancel"
                      ? "border-danger bg-danger/5"
                      : "border-linen-border hover:border-primary-fixed-dim")
                  }
                  aria-pressed={action === "cancel"}
                >
                  <div className="flex items-start gap-3">
                    <CancelIcon />
                    <div>
                      <p className="font-bold text-sm">ביטול שיעור</p>
                      <p className="text-xs text-secondary">
                        זיכוי מלא — נמצאים מחוץ לחלון הביטול בעלות.
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalClose asChild>
                <Button variant={action === "cancel" ? "danger" : "primary"}>
                  {action === "cancel" ? "אשרו ביטול וזיכוי" : "אשרו דחייה"}
                </Button>
              </ModalClose>
              <ModalClose asChild>
                <Button variant="ghost">חזרה</Button>
              </ModalClose>
            </ModalFooter>
          </ModalContent>
        </Modal>
      );
    };
    return <Wrapper />;
  },
};

export const Sizes: Story = {
  name: "Sizes (sm / md / lg side-by-side)",
  parameters: {
    docs: {
      description: {
        story:
          "Three independent Modal instances, one per size. Each modal still traps focus and respects ESC / backdrop-close independently.",
      },
    },
  },
  render: () => (
    <div className="flex items-center gap-3">
      {(["sm", "md", "lg"] as const).map((size) => (
        <Modal key={size}>
          <ModalTrigger asChild>
            <Button variant="outline" size="sm">
              גודל {size}
            </Button>
          </ModalTrigger>
          <ModalContent size={size}>
            <ModalHeader>
              <ModalTitle>גודל {size}</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <p>
                גודל זה מתאים ל-
                {size === "sm"
                  ? "אישורי פעולה קצרים."
                  : size === "md"
                    ? "פעולות סטנדרטיות (ביטול שיעור, אישור הזמנה)."
                    : "טפסים ארוכים יותר (עריכת פרופיל, פרטי תשלום)."}
              </p>
            </ModalBody>
            <ModalFooter>
              <ModalClose asChild>
                <Button variant="primary">אישור</Button>
              </ModalClose>
            </ModalFooter>
          </ModalContent>
        </Modal>
      ))}
    </div>
  ),
};

export const WithLongContent: Story = {
  name: "With long content (scroll-within-modal preserves focus trap)",
  parameters: {
    docs: {
      description: {
        story:
          "Long body content scrolls inside the modal body without breaking the focus trap. Tab still cycles only between focusable elements within the modal (action buttons + close).",
      },
    },
  },
  render: () => (
    <Modal>
      <ModalTrigger asChild>
        <Button variant="outline">קראו את תנאי השימוש</Button>
      </ModalTrigger>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>תנאי השימוש</ModalTitle>
          <ModalDescription className="sr-only">
            תנאי שימוש מלאים של TeachMe.
          </ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-3">
          {Array.from({ length: 30 }).map((_, i) => (
            <p key={i}>
              סעיף {i + 1}. שירות TeachMe מסופק בכפוף לתנאים אלה. השימוש בפלטפורמה מהווה
              אישור והסכמה לתנאים. לקריאת המדיניות המלאה ראו את עמוד מדיניות הפרטיות.
              נוסח זה מודגם לבדיקת התנהגות הגלילה בתוך המודאל.
            </p>
          ))}
        </ModalBody>
        <ModalFooter>
          <ModalClose asChild>
            <Button variant="primary">קראתי ואני מאשר/ת</Button>
          </ModalClose>
          <ModalClose asChild>
            <Button variant="ghost">סגור</Button>
          </ModalClose>
        </ModalFooter>
      </ModalContent>
    </Modal>
  ),
};

export const English: Story = {
  name: "LTR — English (verifies button + icon order swap)",
  globals: { direction: "ltr" },
  parameters: {
    docs: {
      description: {
        story:
          "In LTR, the footer reverses naturally — primary CTA sits on the right. ESC and backdrop close still work identically.",
      },
    },
  },
  render: () => (
    <Modal>
      <ModalTrigger asChild>
        <Button variant="danger">Cancel lesson</Button>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader tone="danger">
          <ModalTitle>Cancel lesson</ModalTitle>
          <ModalDescription>
            You&apos;re outside the no-cost cancellation window. Your full credit will be returned.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm">Are you sure you want to cancel this lesson?</p>
        </ModalBody>
        <ModalFooter>
          <ModalClose asChild>
            <Button variant="danger">Confirm cancel</Button>
          </ModalClose>
          <ModalClose asChild>
            <Button variant="ghost">Go back</Button>
          </ModalClose>
        </ModalFooter>
      </ModalContent>
    </Modal>
  ),
};
