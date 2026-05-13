// Story 1.21: shared state shape for the re-acceptance Server Action. Lives
// outside `actions.ts` because Next.js "use server" files can only export
// async functions.

export interface AcceptActionState {
  ok: boolean;
  formError?: string;
}

export const ACCEPT_INITIAL_STATE: AcceptActionState = { ok: false };
