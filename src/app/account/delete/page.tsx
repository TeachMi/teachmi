import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/guards";
import { deleteAccountAction } from "./actions";
import { DeleteAccountForm } from "./DeleteAccountForm";
import { DELETE_ACCOUNT_INITIAL_STATE } from "./state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "מחיקת חשבון | TeachMe",
};

export default async function DeleteAccountPage() {
  const user = await requireAuth("/account/delete");

  return (
    <AppShell activeHref="/dashboard" mainClassName="flex-1 bg-linen px-6 py-12">
      <section className="mx-auto w-full max-w-3xl space-y-6 text-start">
        <div>
          <p className="text-sm font-bold text-danger">החשבון שלי</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-primary-container">
            מחיקת חשבון
          </h1>
          <p className="mt-3 leading-7 text-on-surface-variant">
            המחיקה מסתירה את החשבון מיד, מנתקת את כל הסשנים ושומרת אפשרות שחזור
            למשך 30 יום.
          </p>
        </div>

        <Card tone="error" padding="md">
          <CardHeader>
            <CardTitle>אישור מחיקה</CardTitle>
          </CardHeader>
          <CardBody className="space-y-5 text-sm leading-7 text-on-surface-variant">
            <p>
              כדי להמשיך, הקלידו את כתובת האימייל של החשבון:
              <span className="font-bold text-primary-container"> {user.email}</span>
            </p>
            <DeleteAccountForm
              action={deleteAccountAction}
              initialState={DELETE_ACCOUNT_INITIAL_STATE}
            />
          </CardBody>
        </Card>
      </section>
    </AppShell>
  );
}
