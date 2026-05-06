import { auditEvents, type NewAuditEvent } from "./schema";

export interface AuditEventInput {
  eventType: string;
  actorKind: string;
  actorId?: string | null;
  actorMeta?: string | null;
  targetType: string;
  targetId?: string | null;
  payload?: Record<string, unknown>;
}

interface InsertValues<TValue> {
  values(value: TValue): Promise<unknown> | unknown;
}

interface AuditTransaction {
  insert(table: typeof auditEvents): InsertValues<NewAuditEvent>;
}

export interface TransactionRunner<TTransaction extends AuditTransaction> {
  transaction<TResult>(
    callback: (transaction: TTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export function toAuditEventValues(input: AuditEventInput): NewAuditEvent {
  return {
    eventType: input.eventType,
    actorKind: input.actorKind,
    actorId: input.actorId ?? null,
    actorMeta: input.actorMeta ?? null,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    payload: input.payload ?? {},
  };
}

export async function writeAuditEvent(
  transaction: AuditTransaction,
  input: AuditEventInput,
): Promise<void> {
  await transaction.insert(auditEvents).values(toAuditEventValues(input));
}

export async function runWithAuditEvent<TTransaction extends AuditTransaction, TResult>(
  database: TransactionRunner<TTransaction>,
  operation: (transaction: TTransaction) => Promise<TResult>,
  auditEvent: AuditEventInput,
): Promise<TResult> {
  return database.transaction(async (transaction) => {
    const result = await operation(transaction);
    await writeAuditEvent(transaction, auditEvent);
    return result;
  });
}
