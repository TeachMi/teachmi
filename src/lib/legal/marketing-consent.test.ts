import { describe, expect, it } from "vitest";
import {
  auditEvents,
  consentReceipts,
  notificationPreferences,
} from "../db/schema";
import {
  CURRENT_MARKETING_OPTIN_VERSION,
  MARKETING_OPTIN_LABEL_HE,
  recordMarketingOptIn,
  type MarketingOptInDb,
} from "./marketing-consent";
// `FakeDb` is a generic hand-rolled Drizzle fake — reused here cross-feature
// (same pattern as the booking flows reusing the tutor fake-db).
import { FakeDb, TrackRecorder, silentLogger } from "../../app/signup/__tests__/fake-db";

describe("marketing-consent constants", () => {
  it("exports a non-empty CURRENT_MARKETING_OPTIN_VERSION", () => {
    expect(typeof CURRENT_MARKETING_OPTIN_VERSION).toBe("string");
    expect(CURRENT_MARKETING_OPTIN_VERSION.length).toBeGreaterThan(0);
  });

  it("exports a non-empty Hebrew marketing label that anchors on the marketing root + optional marker", () => {
    expect(typeof MARKETING_OPTIN_LABEL_HE).toBe("string");
    expect(MARKETING_OPTIN_LABEL_HE.length).toBeGreaterThan(0);
    // The Hebrew root for "marketing" — locks the label's scope wording so a
    // future copy edit doesn't silently drift into transactional territory.
    expect(MARKETING_OPTIN_LABEL_HE).toMatch(/שיווק/);
    // The "(אופציונלי)" marker locks the opt-in semantics — the marketing
    // box must read as visibly optional to satisfy AC1. A rewrite that strips
    // the parenthetical would make the checkbox indistinguishable from the
    // regulatory ones above it. [Code review round 1, P-3.]
    expect(MARKETING_OPTIN_LABEL_HE).toMatch(/אופציונלי/);
  });
});

describe("recordMarketingOptIn", () => {
  it("writes the receipt + audit + notification-preferences upsert and fires analytics", async () => {
    const db = new FakeDb();
    const track = new TrackRecorder();
    db.queueReturning<{ id: string }>([{ id: "mk-receipt-1" }]); // receipt RETURNING

    await recordMarketingOptIn({
      db: db as unknown as MarketingOptInDb,
      userId: "user-1",
      role: "tutor",
      ipAddress: "10.0.0.1",
      userAgent: "Vitest TeachMe",
      source: "tutor_wizard",
      track: track.capture,
      logger: silentLogger,
    });

    expect(db.insertedInto(consentReceipts)).toHaveLength(1);
    const receipt = db.insertedInto(consentReceipts)[0]?.value as Record<string, unknown>;
    expect(receipt.userId).toBe("user-1");
    expect(receipt.documentType).toBe("marketing_opt_in");
    expect(receipt.documentVersion).toBe(CURRENT_MARKETING_OPTIN_VERSION);
    expect(receipt.ipAddress).toBe("10.0.0.1");
    expect(receipt.createdByActor).toBe("user-1");

    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    expect(
      (db.insertedInto(auditEvents)[0]?.value as { eventType: string }).eventType,
    ).toBe("auth.marketing_optin_accepted");

    expect(db.insertedInto(notificationPreferences)).toHaveLength(1);
    expect(
      (db.insertedInto(notificationPreferences)[0]?.value as { marketingEmail: boolean })
        .marketingEmail,
    ).toBe(true);

    expect(track.events).toEqual([
      {
        event: "marketing_optin_accepted",
        userId: "user-1",
        role: "tutor",
        documentVersion: CURRENT_MARKETING_OPTIN_VERSION,
        source: "tutor_wizard",
      },
    ]);
  });

  it("skips the audit + analytics writes when the receipt insert is a conflict no-op", async () => {
    const db = new FakeDb();
    const track = new TrackRecorder();
    db.queueReturning<{ id: string }>([]); // empty RETURNING = ON CONFLICT DO NOTHING no-op

    await recordMarketingOptIn({
      db: db as unknown as MarketingOptInDb,
      userId: "user-2",
      role: "tutor",
      ipAddress: null,
      userAgent: null,
      source: "tutor_wizard",
      track: track.capture,
      logger: silentLogger,
    });

    // The receipt insert was attempted, but it returned no row — so audit,
    // notification_preferences, and analytics are all skipped.
    expect(db.insertedInto(consentReceipts)).toHaveLength(1);
    expect(db.insertedInto(auditEvents)).toHaveLength(0);
    expect(db.insertedInto(notificationPreferences)).toHaveLength(0);
    expect(track.events).toEqual([]);
  });
});
