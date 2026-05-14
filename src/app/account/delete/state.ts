export interface DeleteAccountState {
  ok: boolean;
  error?: string;
}

export const DELETE_ACCOUNT_INITIAL_STATE: DeleteAccountState = { ok: false };
