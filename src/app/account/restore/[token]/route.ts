import { redirect } from "next/navigation";
import { restoreSoftDeletedAccount } from "@/lib/account-deletion/account-deletion";

interface RestoreRouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, context: RestoreRouteContext) {
  const { token } = await context.params;
  const result = await restoreSoftDeletedAccount(token);

  if (!result.ok) {
    redirect("/signin?restore=expired");
  }

  redirect("/signin?restore=1");
}
