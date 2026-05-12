// Hand-rolled FakeDb scoped to a single transaction — mirrors the
// FakeTransaction pattern from `src/lib/db/__tests__/audit.test.ts`. The
// signup FakeDb (`src/app/signup/__tests__/fake-db.ts`) is top-level not
// tx-scoped, so we don't reuse it directly — we just follow the same shape.

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

class FakeTutorTx {
  readonly inserts: CapturedInsert[] = [];
  readonly updates: CapturedUpdate[] = [];
  readonly deletes: CapturedDelete[] = [];
  /** Each select call shifts the next response. Use {@link FakeTutorDb.queueSelect}. */
  readonly selectResponses: unknown[][] = [];
  /** Each .returning() shifts the next response. Use {@link FakeTutorDb.queueReturning}. */
  readonly returningResponses: unknown[][] = [];

  select(cols: unknown) {
    void cols;
    return {
      from: (table: unknown) => {
        void table;
        return {
          where: (condition: unknown) => {
            void condition;
            const next = this.selectResponses.shift() ?? [];
            return Promise.resolve(next);
          },
        };
      },
    };
  }

  insert(table: unknown) {
    return {
      values: (value: unknown) => {
        this.inserts.push({ table, value });
        const base: Promise<unknown> = Promise.resolve(undefined);
        return Object.assign(base, {
          returning: (cols: unknown) => {
            void cols;
            return Promise.resolve(this.returningResponses.shift() ?? []);
          },
        });
      },
    };
  }

  update(table: unknown) {
    return {
      set: (set: unknown) => ({
        where: (whereCondition: unknown) => {
          this.updates.push({ table, set, whereCondition });
          const base: Promise<unknown> = Promise.resolve(undefined);
          return Object.assign(base, {
            returning: (cols: unknown) => {
              void cols;
              return Promise.resolve(this.returningResponses.shift() ?? []);
            },
          });
        },
      }),
    };
  }

  delete(table: unknown) {
    return {
      where: (whereCondition: unknown) => {
        this.deletes.push({ table, whereCondition });
        return Promise.resolve(undefined);
      },
    };
  }

  insertedInto(table: unknown): CapturedInsert[] {
    return this.inserts.filter((entry) => entry.table === table);
  }
  updatedAt(table: unknown): CapturedUpdate[] {
    return this.updates.filter((entry) => entry.table === table);
  }
  deletedFrom(table: unknown): CapturedDelete[] {
    return this.deletes.filter((entry) => entry.table === table);
  }
}

export class FakeTutorDb {
  lastTx: FakeTutorTx | null = null;
  /** Captured by every tx; persists across `transaction` calls. */
  readonly inserts: CapturedInsert[] = [];
  readonly updates: CapturedUpdate[] = [];
  readonly deletes: CapturedDelete[] = [];
  /** When set, the next `transaction(...)` rejects with this error. */
  failNext: Error | null = null;

  /** Pre-queue rows the next tx-scoped `.select(...).from(...).where(...)` will return. */
  selectQueue: unknown[][] = [];
  /** Pre-queue rows for `.returning(...)` on insert/update. */
  returningQueue: unknown[][] = [];

  queueSelect<T>(rows: T[]): this {
    this.selectQueue.push(rows as unknown[]);
    return this;
  }
  queueReturning<T>(rows: T[]): this {
    this.returningQueue.push(rows as unknown[]);
    return this;
  }

  async transaction<TResult>(callback: (tx: FakeTutorTx) => Promise<TResult>): Promise<TResult> {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    const tx = new FakeTutorTx();
    tx.selectResponses.push(...this.selectQueue);
    tx.returningResponses.push(...this.returningQueue);
    this.selectQueue = [];
    this.returningQueue = [];
    try {
      const result = await callback(tx);
      this.lastTx = tx;
      this.inserts.push(...tx.inserts);
      this.updates.push(...tx.updates);
      this.deletes.push(...tx.deletes);
      return result;
    } catch (err) {
      this.lastTx = tx;
      // Captured operations stay on the tx but do NOT leak into the persistent
      // arrays — emulates rollback. Caller can still inspect `lastTx` for what
      // was attempted.
      throw err;
    }
  }

  insertedInto(table: unknown): CapturedInsert[] {
    return this.inserts.filter((entry) => entry.table === table);
  }
  updatedAt(table: unknown): CapturedUpdate[] {
    return this.updates.filter((entry) => entry.table === table);
  }
  deletedFrom(table: unknown): CapturedDelete[] {
    return this.deletes.filter((entry) => entry.table === table);
  }
}

export class TrackRecorder {
  readonly events: unknown[] = [];
  capture = (event: unknown): void => {
    this.events.push(event);
  };
}

export const silentLogger = { error: () => undefined };
