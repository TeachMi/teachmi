"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import {
  createDependentStudent,
  validateDependentInput,
} from "@/lib/dependents/dependents";

export interface DependentActionState {
  ok: boolean;
  fieldErrors?: {
    name?: string;
    dateOfBirth?: string;
  };
}

export async function addDependentAction(
  _prevState: DependentActionState,
  formData: FormData,
): Promise<DependentActionState> {
  const parent = await requireAuth("/account/dependents");
  const validated = validateDependentInput(formData);
  if (!validated.ok) {
    return { ok: false, fieldErrors: validated.fieldErrors };
  }

  await createDependentStudent({
    parentUserId: parent.id,
    ...validated.values,
  });

  redirect("/account/dependents?created=1");
}
