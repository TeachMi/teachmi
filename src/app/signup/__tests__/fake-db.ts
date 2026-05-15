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
  onConflictDoUpdate(opts: unknown): InsertBuilder;
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
  /**
   * When non-empty, ANY `insert(table)` whose `table` reference is in the set
   * throws synchronously from `.values(...)`. Useful for testing the
   * cleanup-on-error path for a specific table (e.g., Story 1.21's
   * `consent_receipts` insert) without having to manually count prior inserts.
   */
  readonly failingTables: Set<unknown> = new Set();

  /**
   * Per-table running count of `.insert(table).values(...)` invocations.
   * Combined with `failOnNthByTable` lets tests target a specific Nth write
   * into a table — e.g., for Story 1.22 we want the SECOND insert into
   * `consent_receipts` (the marketing receipt) to fail while the FIRST
   * (the privacy receipt) succeeds.
   */
  private readonly insertCountByTable: Map<unknown, number> = new Map();
  private readonly failOnNthByTable: Map<unknown, Set<number>> = new Map();

  queueSelect<T>(rows: T[]): this {
    this.selectResponses.push(rows as unknown[]);
    return this;
  }

  queueReturning<T>(rows: T[]): this {
    this.returningResponses.push(rows as unknown[]);
    return this;
  }

  /**
   * Stage a synchronous rejection on the Nth (1-indexed) `.insert(table).values(...)`
   * call against the given table reference. Multiple Ns can be staged per table.
   * Story 1.22: used to fail only the marketing-receipt insert while letting
   * the prior privacy-receipt insert succeed.
   */
  failOnNthInsertInto(table: unknown, n: number): this {
    const set = this.failOnNthByTable.get(table) ?? new Set<number>();
    set.add(n);
    this.failOnNthByTable.set(table, set);
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
            // The result of `.where(...)` is BOTH awaitable (existing callers
            // skip orderBy/limit) AND chainable to .orderBy().limit() — this
            // mirrors Drizzle's PgSelectBase which is similarly thenable +
            // chainable. Story 1.21's privacy-consent gate needs the longer
            // chain to read the user's most-recent consent receipt.
            const promise: Promise<unknown[]> = Promise.resolve(next);
            const orderByChain = {
              limit: (n: number) => Promise.resolve(next.slice(0, n)),
            };
            return Object.assign(promise, {
              orderBy: (...specs: unknown[]) => {
                void specs;
                return orderByChain;
              },
              limit: (n: number) => Promise.resolve(next.slice(0, n)),
            });
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

  private makeRejectedBuilder(err: Error): InsertBuilder {
    const rejected = Promise.reject(err);
    // Swallow the unhandled-rejection telemetry warning that Promise.reject
    // would otherwise emit before the awaiting caller reaches its catch.
    rejected.catch(() => undefined);
    const builder: InsertBuilder = Object.assign(rejected, {
      returning: (cols: unknown) => {
        void cols;
        const r = Promise.reject(err) as Promise<unknown[]>;
        r.catch(() => undefined);
        return r;
      },
      // Both conflict-chain methods MUST return the same rejecting builder so
      // a `.values().onConflictDoNothing().returning()` chain stays rejected
      // and does NOT accidentally record the write in `inserts` via a
      // recursive makeInsertBuilder() call.
      onConflictDoNothing: (opts?: unknown) => {
        void opts;
        return builder;
      },
      onConflictDoUpdate: (opts: unknown) => {
        void opts;
        return builder;
      },
    });
    return builder;
  }

  private makeInsertBuilder(table: unknown, value: unknown): InsertBuilder {
    // Whole-table rejection short-circuit — does NOT increment the per-table
    // counter so that combining `failingTables` with `failOnNthInsertInto` on
    // the same table behaves predictably (rejected inserts don't shift the
    // N-targeting). [Code review round 1, P-2.]
    if (this.failingTables.has(table)) {
      return this.makeRejectedBuilder(
        new Error(
          `FakeDb.failingTables: rejected insert into table ${String(table)}`,
        ),
      );
    }
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      return this.makeRejectedBuilder(err);
    }
    // Per-table call counting + targeted-N failure. Story 1.22 introduces this
    // so a test can fail the SECOND insert into `consent_receipts` (the
    // marketing receipt) while letting the FIRST (the privacy receipt) succeed.
    // Counter increments only when we've decided this insert is reaching the
    // counting stage (i.e., not blanket-rejected above).
    const count = (this.insertCountByTable.get(table) ?? 0) + 1;
    this.insertCountByTable.set(table, count);
    const failSet = this.failOnNthByTable.get(table);
    if (failSet?.has(count)) {
      return this.makeRejectedBuilder(
        new Error(
          `FakeDb.failOnNthInsertInto: rejected insert #${count} into table ${String(table)}`,
        ),
      );
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
      onConflictDoUpdate: (opts: unknown) => {
        void opts;
        // UPSERT path: the captured write already landed in `inserts`. The
        // SET shape is opaque to the FakeDb — tests assert on what was
        // attempted, not on the post-update row state.
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
