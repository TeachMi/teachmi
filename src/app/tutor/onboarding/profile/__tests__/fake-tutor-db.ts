// Hand-rolled fake matching the Drizzle surface the tutor-profile orchestrators
// use. Mirrors the FakeTransaction pattern from `src/lib/db/__tests__/audit.test.ts`,
// flattened to top-level because the orchestrator no longer wraps writes in
// `db.transaction(...)` (neon-http driver does not support transactions).

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

export class FakeTutorDb {
  readonly inserts: CapturedInsert[] = [];
  readonly updates: CapturedUpdate[] = [];
  readonly deletes: CapturedDelete[] = [];

  /** Pre-queue rows for the next `db.select(...).from(...).where(...)` call. */
  selectQueue: unknown[][] = [];
  /** Pre-queue rows for `.returning(...)` on insert/update. */
  returningQueue: unknown[][] = [];

  /** When non-null, the next select / insert / update / delete throws this error then clears. */
  failNext: Error | null = null;

  queueSelect<T>(rows: T[]): this {
    this.selectQueue.push(rows as unknown[]);
    return this;
  }

  queueReturning<T>(rows: T[]): this {
    this.returningQueue.push(rows as unknown[]);
    return this;
  }

  private takeFailNext(): Error | null {
    if (this.failNext === null) return null;
    const err = this.failNext;
    this.failNext = null;
    return err;
  }

  select = (cols: unknown) => {
    void cols;
    return {
      from: (table: unknown) => {
        void table;
        return {
          where: (condition: unknown) => {
            void condition;
            const err = this.takeFailNext();
            if (err) return Promise.reject(err);
            const next = this.selectQueue.shift() ?? [];
            return Promise.resolve(next);
          },
        };
      },
    };
  };

  insert = (table: unknown) => {
    return {
      values: (value: unknown) => {
        const err = this.takeFailNext();
        if (err) {
          const rejected = Promise.reject(err);
          return Object.assign(rejected, {
            returning: () => Promise.reject(err) as Promise<unknown[]>,
          });
        }
        this.inserts.push({ table, value });
        const base: Promise<unknown> = Promise.resolve(undefined);
        return Object.assign(base, {
          returning: (cols: unknown) => {
            void cols;
            return Promise.resolve(this.returningQueue.shift() ?? []);
          },
        });
      },
    };
  };

  update = (table: unknown) => {
    return {
      set: (set: unknown) => ({
        where: (whereCondition: unknown) => {
          const err = this.takeFailNext();
          if (err) {
            const rejected = Promise.reject(err);
            return Object.assign(rejected, {
              returning: () => Promise.reject(err) as Promise<unknown[]>,
            });
          }
          this.updates.push({ table, set, whereCondition });
          const base: Promise<unknown> = Promise.resolve(undefined);
          return Object.assign(base, {
            returning: (cols: unknown) => {
              void cols;
              return Promise.resolve(this.returningQueue.shift() ?? []);
            },
          });
        },
      }),
    };
  };

  delete = (table: unknown) => {
    return {
      where: (whereCondition: unknown) => {
        const err = this.takeFailNext();
        if (err) return Promise.reject(err);
        this.deletes.push({ table, whereCondition });
        return Promise.resolve(undefined);
      },
    };
  };

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
