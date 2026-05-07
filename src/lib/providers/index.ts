/**
 * Provider barrel — the ONLY entry-point Server Actions and Inngest functions
 * should use to reach external vendors. Per AD-13 + architecture.md §15:
 *
 *   - never import vendor SDKs directly
 *   - never import from `<provider>/stub.ts` or `<provider>/full.ts`
 *   - the env-var (PAYMENTS_PROVIDER, INVOICE_PROVIDER, …) is the cutover knob
 *
 * Five named getters by design — matches the codebase convention (getDb,
 * getSqlClient) and keeps each return type concrete without TS overload
 * gymnastics.
 */

export { getPaymentProvider } from "./payment";
export { getInvoiceProvider } from "./invoice";
export { getGovIlProvider } from "./govil";
export { getLessonRoomProvider } from "./lesson-room";
export { getEmailProvider } from "./email";
