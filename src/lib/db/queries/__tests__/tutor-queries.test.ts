import { describe, expect, it } from "vitest";
import {
  DISCOVERABLE_TUTOR_PUBLIC_KEYS,
  discoverableTutorWhere,
  getDiscoverableTutorByUserId,
  isTutorDiscoverable,
} from "../tutor-queries";
import { FakeDiscoveryDb, buildFakeRow } from "./fake-discovery-db";

const TUTOR_ID = "00000000-0000-0000-0000-000000000001";
const ANOTHER_TUTOR_ID = "00000000-0000-0000-0000-000000000002";

describe("discoverableTutorWhere()", () => {
  it("returns a non-undefined SQL clause (sanity)", () => {
    const clause = discoverableTutorWhere();
    expect(clause).toBeDefined();
    expect(clause).not.toBeNull();
  });
});

describe("getDiscoverableTutorByUserId — state transitions", () => {
  it("never-approved (hidden): is_active=false, vetting_status='pending' → null", async () => {
    const db = new FakeDiscoveryDb().upsert(
      buildFakeRow({ userId: TUTOR_ID, isActive: false, vettingStatus: "pending" }),
    );
    db.withQueriedUserId(TUTOR_ID);

    const result = await getDiscoverableTutorByUserId(TUTOR_ID, { db });
    expect(result).toBeNull();

    const visible = await isTutorDiscoverable(TUTOR_ID, { db });
    expect(visible).toBe(false);
  });

  it("approved (visible): is_active=true, vetting_status='approved' → row", async () => {
    const db = new FakeDiscoveryDb().upsert(
      buildFakeRow({ userId: TUTOR_ID, isActive: true, vettingStatus: "approved" }),
    );
    db.withQueriedUserId(TUTOR_ID);

    const result = await getDiscoverableTutorByUserId(TUTOR_ID, { db });
    expect(result).not.toBeNull();
    expect(result?.userId).toBe(TUTOR_ID);
    expect(result?.displayName).toBe("ד״ר מיכל לוי");

    const visible = await isTutorDiscoverable(TUTOR_ID, { db });
    expect(visible).toBe(true);
  });

  it("re-uploaded after approval (hidden again): is_active=false, vetting_status='pending' → null", async () => {
    // Start in the approved state, then simulate Story 2.5's re-upload flip:
    // is_active=false, vetting_status='pending'. Discoverability follows
    // is_active, not vetting_status.
    const db = new FakeDiscoveryDb().upsert(
      buildFakeRow({ userId: TUTOR_ID, isActive: true, vettingStatus: "approved" }),
    );
    db.withQueriedUserId(TUTOR_ID);
    expect(await isTutorDiscoverable(TUTOR_ID, { db })).toBe(true);

    db.patch(TUTOR_ID, { isActive: false, vettingStatus: "pending" });
    expect(await isTutorDiscoverable(TUTOR_ID, { db })).toBe(false);
    expect(await getDiscoverableTutorByUserId(TUTOR_ID, { db })).toBeNull();
  });

  it("admin re-approves (visible again): is_active=true → row", async () => {
    const db = new FakeDiscoveryDb().upsert(
      buildFakeRow({ userId: TUTOR_ID, isActive: false, vettingStatus: "pending" }),
    );
    db.withQueriedUserId(TUTOR_ID);
    expect(await isTutorDiscoverable(TUTOR_ID, { db })).toBe(false);

    db.patch(TUTOR_ID, { isActive: true, vettingStatus: "approved" });
    expect(await isTutorDiscoverable(TUTOR_ID, { db })).toBe(true);
  });

  it("soft-deleted tutor stays hidden even when is_active=true", async () => {
    const db = new FakeDiscoveryDb().upsert(
      buildFakeRow({
        userId: TUTOR_ID,
        isActive: true,
        vettingStatus: "approved",
        deletedAt: new Date("2026-05-13T10:00:00.000Z"),
      }),
    );
    db.withQueriedUserId(TUTOR_ID);
    expect(await isTutorDiscoverable(TUTOR_ID, { db })).toBe(false);
    expect(await getDiscoverableTutorByUserId(TUTOR_ID, { db })).toBeNull();
  });

  it("nonexistent userId → null (no row in DB)", async () => {
    const db = new FakeDiscoveryDb();
    db.withQueriedUserId(TUTOR_ID);
    expect(await getDiscoverableTutorByUserId(TUTOR_ID, { db })).toBeNull();
    expect(await isTutorDiscoverable(TUTOR_ID, { db })).toBe(false);
  });

  it("paused tutor (is_active=false explicitly) stays hidden", async () => {
    // FR50 / Story 7.5 — admin pause sets is_active=false (and may set
    // vetting_status='paused'). The gate stays consistent: is_active rules.
    const db = new FakeDiscoveryDb().upsert(
      buildFakeRow({ userId: TUTOR_ID, isActive: false, vettingStatus: "paused" }),
    );
    db.withQueriedUserId(TUTOR_ID);
    expect(await isTutorDiscoverable(TUTOR_ID, { db })).toBe(false);
  });

  it("does not leak another tutor's row when queried userId differs", async () => {
    // Defense-in-depth: even if the helper's WHERE is wrong, the FakeDb
    // filter still uses queriedUserId. Verifies the helper's
    // `eq(tutorProfiles.userId, userId)` clause is the gate, not just
    // discoverability.
    const db = new FakeDiscoveryDb()
      .upsert(
        buildFakeRow({ userId: TUTOR_ID, isActive: true, vettingStatus: "approved" }),
      )
      .upsert(
        buildFakeRow({
          userId: ANOTHER_TUTOR_ID,
          isActive: true,
          vettingStatus: "approved",
          displayName: "מורה שני",
        }),
      );

    db.withQueriedUserId(TUTOR_ID);
    const result = await getDiscoverableTutorByUserId(TUTOR_ID, { db });
    expect(result?.displayName).toBe("ד״ר מיכל לוי");
  });
});

describe("getDiscoverableTutorByUserId — public column shape", () => {
  it("returned row shape exactly matches DISCOVERABLE_TUTOR_PUBLIC_KEYS allowlist", async () => {
    const db = new FakeDiscoveryDb().upsert(
      buildFakeRow({ userId: TUTOR_ID, isActive: true }),
    );
    db.withQueriedUserId(TUTOR_ID);
    const result = await getDiscoverableTutorByUserId(TUTOR_ID, { db });

    expect(result).not.toBeNull();
    const actualKeys = Object.keys(result!).sort();
    const allowedKeys = [...DISCOVERABLE_TUTOR_PUBLIC_KEYS].sort();
    expect(actualKeys).toEqual(allowedKeys);

    // Spot-check that private columns are NOT present.
    const opaque = result as unknown as Record<string, unknown>;
    expect(opaque.vettingNotes).toBeUndefined();
    expect(opaque.vettedByAdminId).toBeUndefined();
    expect(opaque.commissionRateOverride).toBeUndefined();
    expect(opaque.isActive).toBeUndefined();
    expect(opaque.deletedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Story 3.2 additions — sibling helpers for the public profile page.
// ---------------------------------------------------------------------------

import {
  getActiveBookingsForTutor,
  getTutorAvailabilityRows,
  getTutorRatingHistogram,
  getTutorSubjects,
} from "../tutor-queries";
import { FakeFullProfileDb } from "./fake-full-profile-db";

const RANGE_FROM = new Date("2026-05-14T00:00:00.000Z");
const RANGE_TO = new Date("2026-05-21T00:00:00.000Z");

describe("getTutorSubjects (Story 3.2)", () => {
  it("returns active subjects joined with proficiency notes, sorted by sortOrder", async () => {
    const db = new FakeFullProfileDb();
    db.subjects.push(
      { id: "s-1", slug: "mathematics", displayNameHe: "מתמטיקה", sortOrder: 1, isActive: true },
      { id: "s-2", slug: "english", displayNameHe: "אנגלית", sortOrder: 2, isActive: true },
      { id: "s-3", slug: "hidden", displayNameHe: "מוסתר", sortOrder: 0, isActive: false },
    );
    db.tutorSubjects.push(
      { tutorUserId: TUTOR_ID, subjectId: "s-1", proficiencyNote: "5 יחידות" },
      { tutorUserId: TUTOR_ID, subjectId: "s-2", proficiencyNote: null },
      { tutorUserId: TUTOR_ID, subjectId: "s-3", proficiencyNote: null },
    );
    db.withTutorId(TUTOR_ID);

    const result = await getTutorSubjects(TUTOR_ID, { db });
    expect(result).toHaveLength(2); // inactive subject filtered out
    expect(result[0]!.slug).toBe("mathematics"); // sortOrder=1 first
    expect(result[0]!.proficiencyNote).toBe("5 יחידות");
    expect(result[1]!.slug).toBe("english");
  });

  it("returns empty array when tutor has no subjects", async () => {
    const db = new FakeFullProfileDb();
    db.withTutorId(TUTOR_ID);
    const result = await getTutorSubjects(TUTOR_ID, { db });
    expect(result).toEqual([]);
  });
});

describe("getTutorAvailabilityRows (Story 3.2)", () => {
  it("returns rows for the queried tutor in the date range", async () => {
    const db = new FakeFullProfileDb();
    db.availability.push(
      {
        tutorUserId: TUTOR_ID,
        id: "av-1",
        kind: "recurring",
        weekday: 4,
        date: null,
        startTime: "14:00:00",
        endTime: "18:00:00",
        validFrom: null,
        validUntil: null,
      },
    );
    db.withTutorId(TUTOR_ID).withRange(RANGE_FROM, RANGE_TO);
    const result = await getTutorAvailabilityRows(
      TUTOR_ID,
      { from: RANGE_FROM, to: RANGE_TO },
      { db },
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe("recurring");
  });

  it("excludes expired validity windows", async () => {
    const db = new FakeFullProfileDb();
    db.availability.push({
      tutorUserId: TUTOR_ID,
      id: "av-2",
      kind: "recurring",
      weekday: 4,
      date: null,
      startTime: "14:00:00",
      endTime: "18:00:00",
      validFrom: null,
      validUntil: "2026-05-01", // expired before range
    });
    db.withTutorId(TUTOR_ID).withRange(RANGE_FROM, RANGE_TO);
    const result = await getTutorAvailabilityRows(
      TUTOR_ID,
      { from: RANGE_FROM, to: RANGE_TO },
      { db },
    );
    expect(result).toEqual([]);
  });
});

describe("getActiveBookingsForTutor (Story 3.2)", () => {
  it("returns only active bookings (pending_payment + confirmed), excludes cancelled/completed/no_show", async () => {
    const db = new FakeFullProfileDb();
    db.bookings.push(
      {
        tutorUserId: TUTOR_ID,
        id: "b-1",
        startsAt: new Date("2026-05-15T11:00:00.000Z"),
        durationMinutes: 60,
        status: "confirmed",
      },
      {
        tutorUserId: TUTOR_ID,
        id: "b-2",
        startsAt: new Date("2026-05-16T11:00:00.000Z"),
        durationMinutes: 60,
        status: "pending_payment",
      },
      {
        tutorUserId: TUTOR_ID,
        id: "b-3-cancelled",
        startsAt: new Date("2026-05-17T11:00:00.000Z"),
        durationMinutes: 60,
        status: "cancelled",
      },
      {
        tutorUserId: TUTOR_ID,
        id: "b-4-completed",
        startsAt: new Date("2026-05-18T11:00:00.000Z"),
        durationMinutes: 60,
        status: "completed",
      },
      {
        tutorUserId: TUTOR_ID,
        id: "b-5-no-show",
        startsAt: new Date("2026-05-19T11:00:00.000Z"),
        durationMinutes: 60,
        status: "no_show",
      },
    );
    db.withTutorId(TUTOR_ID).withRange(RANGE_FROM, RANGE_TO);
    const result = await getActiveBookingsForTutor(
      TUTOR_ID,
      { from: RANGE_FROM, to: RANGE_TO },
      { db },
    );
    // Exactly the 2 active bookings, no more.
    expect(result).toHaveLength(2);
    const ids = result.map((b) => b.id).sort();
    expect(ids).toEqual(["b-1", "b-2"]);
  });

  it("does not return bookings outside the date range", async () => {
    const db = new FakeFullProfileDb();
    db.bookings.push({
      tutorUserId: TUTOR_ID,
      id: "b-99",
      startsAt: new Date("2026-06-01T11:00:00.000Z"),
      durationMinutes: 60,
      status: "confirmed",
    });
    db.withTutorId(TUTOR_ID).withRange(RANGE_FROM, RANGE_TO);
    const result = await getActiveBookingsForTutor(
      TUTOR_ID,
      { from: RANGE_FROM, to: RANGE_TO },
      { db },
    );
    expect(result).toEqual([]);
  });
});

describe("getTutorRatingHistogram (Story 3.2)", () => {
  it("returns null when tutor has no ratings", async () => {
    const db = new FakeFullProfileDb();
    db.withTutorId(TUTOR_ID);
    const result = await getTutorRatingHistogram(TUTOR_ID, { db });
    expect(result).toBeNull();
  });

  it("aggregates ratings by score with correct average", async () => {
    const db = new FakeFullProfileDb();
    db.ratings.push(
      { tutorUserId: TUTOR_ID, score: 5 },
      { tutorUserId: TUTOR_ID, score: 5 },
      { tutorUserId: TUTOR_ID, score: 5 },
      { tutorUserId: TUTOR_ID, score: 4 },
      { tutorUserId: TUTOR_ID, score: 3 },
    );
    db.withTutorId(TUTOR_ID);
    const result = await getTutorRatingHistogram(TUTOR_ID, { db });
    expect(result).not.toBeNull();
    expect(result!.total).toBe(5);
    expect(result!.score5).toBe(3);
    expect(result!.score4).toBe(1);
    expect(result!.score3).toBe(1);
    expect(result!.score2).toBe(0);
    expect(result!.score1).toBe(0);
    // Average = (5+5+5+4+3) / 5 = 4.4
    expect(result!.average).toBeCloseTo(4.4, 1);
  });

  it("returns a single-score histogram when all ratings agree", async () => {
    const db = new FakeFullProfileDb();
    db.ratings.push(
      { tutorUserId: TUTOR_ID, score: 5 },
      { tutorUserId: TUTOR_ID, score: 5 },
    );
    db.withTutorId(TUTOR_ID);
    const result = await getTutorRatingHistogram(TUTOR_ID, { db });
    expect(result?.total).toBe(2);
    expect(result?.score5).toBe(2);
    expect(result?.average).toBe(5);
  });
});

describe("cross-tutor isolation (Story 3.2)", () => {
  it("getTutorSubjects does not leak another tutor's rows", async () => {
    const db = new FakeFullProfileDb();
    db.subjects.push({
      id: "s-1",
      slug: "mathematics",
      displayNameHe: "מתמטיקה",
      sortOrder: 1,
      isActive: true,
    });
    db.tutorSubjects.push(
      { tutorUserId: TUTOR_ID, subjectId: "s-1", proficiencyNote: null },
      { tutorUserId: ANOTHER_TUTOR_ID, subjectId: "s-1", proficiencyNote: "should-not-leak" },
    );
    db.withTutorId(TUTOR_ID);
    const result = await getTutorSubjects(TUTOR_ID, { db });
    expect(result).toHaveLength(1);
    expect(result[0]!.proficiencyNote).toBeNull();
  });
});
