// Hand-rolled fake matching the Drizzle surface the signup orchestrators use.
// Mirrors the FakeTransaction pattern from src/lib/db/__tests__/audit.test.ts —
// no vi.mock(), no real Neon connection.

export interface CapturedInsert {
  table: unknown;
  value: unknown;
}

export interface CapturedUpdate {
  table: unknown;
  set: unknown;
  whereCondition: unknown;
}

export interface CapturedDelete {
  table: unknown;
  whereCondition: unknown;
}

type InsertBuilder = Promise<unknown> & {
  returning(cols: unknown): Promise<unknown[]>;
  onConflictDoNothing(opts?: unknown): InsertBuilder;
};

export class FakeDb {
  /** Each call to `db.select(...).from(...).where(...)` shifts one entry. */
  readonly selectResponses: unknown[][] = [];
  /** Each call to `.returning(...)` after `insert` or `update` shifts one entry. */
  readonly returningResponses: unknown[][] = [];

  readonly inserts: CapturedInsert[] = [];
  readonly updates: CapturedUpdate[] = [];
  readonly deletes: CapturedDelete[] = [];

  /** When set, the next select / insert / update / delete throws. */
  failNext: Error | null = null;

  queueSelect<T>(rows: T[]): this {
    this.selectResponses.push(rows as unknown[]);
    return this;
  }

  queueReturning<T>(rows: T[]): this {
    this.returningResponses.push(rows as unknown[]);
    return this;
  }

  // Class-field arrow functions so methods do not re-bind `this`.

  select = (cols: unknown) => {
    void cols;
    return {
      from: (table: unknown) => {
        void table;
        return {
          where: (condition: unknown) => {
            void condition;
            if (this.failNext) {
              const err = this.failNext;
              this.failNext = null;
              return Promise.reject(err);
            }
            const next = this.selectResponses.shift() ?? [];
            return Promise.resolve(next);
          },
        };
      },
    };
  };

  insert = (table: unknown) => {
    return {
      values: (value: unknown): InsertBuilder => {
        return this.makeInsertBuilder(table, value);
      },
    };
  };

  private makeInsertBuilder(table: unknown, value: unknown): InsertBuilder {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      const rejected = Promise.reject(err);
      const builder: InsertBuilder = Object.assign(rejected, {
        returning: (cols: unknown) => {
          void cols;
          return Promise.reject(err) as Promise<unknown[]>;
        },
        onConflictDoNothing: (opts?: unknown) => {
          void opts;
          return this.makeInsertBuilder(table, value);
        },
      });
      return builder;
    }
    this.inserts.push({ table, value });
    const base: Promise<unknown> = Promise.resolve(undefined);
    const builder: InsertBuilder = Object.assign(base, {
      returning: (cols: unknown) => {
        void cols;
        return Promise.resolve(this.returningResponses.shift() ?? []);
      },
      onConflictDoNothing: (opts?: unknown) => {
        void opts;
        // Conflict path: the test's queued `returningResponses` drives the
        // resulting row return. Stage an empty array to simulate a conflict.
        return builder;
      },
    });
    return builder;
  }

  update = (table: unknown) => {
    return {
      set: (set: unknown) => {
        return {
          where: (whereCondition: unknown) => {
            // Drizzle's `db.update().set().where()` is awaitable on its own
            // (returns the executed query) AND can chain `.returning(...)`.
            // Mirror that by returning a Promise augmented with `.returning`,
            // same pattern this fake uses for `delete().where()` below.
            if (this.failNext) {
              const err = this.failNext;
              this.failNext = null;
              const rejected = Promise.reject(err);
              return Object.assign(rejected, {
                returning: (cols: unknown) => {
                  void cols;
                  return Promise.reject(err) as Promise<unknown[]>;
                },
              });
            }
            this.updates.push({ table, set, whereCondition });
            const promise: Promise<unknown> & {
              returning?: (cols: unknown) => Promise<unknown[]>;
            } = Promise.resolve(undefined);
            promise.returning = (cols: unknown) => {
              void cols;
              return Promise.resolve(this.returningResponses.shift() ?? []);
            };
            return promise as Promise<unknown> & {
              returning(cols: unknown): Promise<unknown[]>;
            };
          },
        };
      },
    };
  };

  delete = (table: unknown) => {
    return {
      where: (whereCondition: unknown) => {
        if (this.failNext) {
          const err = this.failNext;
          this.failNext = null;
          const rejected = Promise.reject(err);
          return Object.assign(rejected, {
            returning: (cols: unknown) => {
              void cols;
              return Promise.reject(err);
            },
          });
        }
        this.deletes.push({ table, whereCondition });
        const promise: Promise<unknown> & {
          returning?: (cols: unknown) => Promise<unknown[]>;
        } = Promise.resolve(undefined);
        promise.returning = (cols: unknown) => {
          void cols;
          return Promise.resolve(this.returningResponses.shift() ?? []);
        };
        return promise as Promise<unknown> & {
          returning(cols: unknown): Promise<unknown[]>;
        };
      },
    };
  };

  insertedInto(table: unknown): CapturedInsert[] {
    return this.inserts.filter((entry) => entry.table === table);
  }

  updatedAt(table: unknown): CapturedUpdate[] {
    return this.updates.filter((entry) => entry.table === table);
  }
}

export interface FakeEmailSend {
  toAddress: string;
  subject: string;
  templateId: string;
  payload: Record<string, unknown>;
}

export class FakeEmailProvider {
  readonly sends: FakeEmailSend[] = [];
  failNext: Error | null = null;

  async sendTransactional(input: FakeEmailSend) {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    this.sends.push({ ...input, payload: { ...input.payload } });
    return { messageId: `fake-${input.templateId}`, kind: "transactional" as const };
  }

  sendMarketingWithConsentReceipt(): Promise<never> {
    return Promise.reject(
      new Error("FakeEmailProvider.sendMarketingWithConsentReceipt: not implemented"),
    );
  }
}

export function makeFormData(record: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(record)) {
    fd.set(key, value);
  }
  return fd;
}

export class TrackRecorder {
  readonly events: unknown[] = [];
  capture = (event: unknown): void => {
    this.events.push(event);
  };
}

export const silentLogger = { error: () => undefined };
