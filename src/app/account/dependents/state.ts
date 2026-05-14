export interface DependentActionState {
  ok: boolean;
  fieldErrors?: {
    name?: string;
    dateOfBirth?: string;
  };
}

export const DEPENDENT_INITIAL_STATE: DependentActionState = { ok: false };
