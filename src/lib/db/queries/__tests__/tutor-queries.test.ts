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
