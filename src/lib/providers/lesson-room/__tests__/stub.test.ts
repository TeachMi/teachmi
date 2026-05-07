import { describe, expect, it } from "vitest";
import { StubLessonRoomProvider } from "../stub";

describe("StubLessonRoomProvider", () => {
  const provider = new StubLessonRoomProvider();

  it("createRoom returns a deterministic room handle seeded from the lesson ID", async () => {
    const handle = await provider.createRoom({ lessonId: "lesson-9", durationMin: 60 });

    expect(handle).toEqual({
      roomId: "stub-room-lesson-9",
      roomUrl: "/dev/stub-room/lesson-9",
    });
  });

  it("issueRoomToken returns a deterministic token seeded from room + user ID", async () => {
    const token = await provider.issueRoomToken({
      roomId: "stub-room-lesson-9",
      userId: "user-123",
      role: "tutor",
    });

    expect(token).toEqual({
      token: "stub-token-stub-room-lesson-9-user-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
  });

  it("getRoomMetadata reports the room as ready with no participants", async () => {
    const meta = await provider.getRoomMetadata("stub-room-lesson-9");

    expect(meta).toEqual({
      roomId: "stub-room-lesson-9",
      status: "ready",
      participantCount: 0,
    });
  });

  it("processSessionEvents acknowledges every event passed in", async () => {
    const result = await provider.processSessionEvents([
      { type: "started", at: "2026-05-07T10:00:00.000Z", vendorEventId: "evt-1" },
      { type: "joined", at: "2026-05-07T10:00:05.000Z", userId: "u-1", vendorEventId: "evt-2" },
      { type: "ended", at: "2026-05-07T11:00:00.000Z", vendorEventId: "evt-3" },
    ]);

    expect(result).toEqual({ acknowledged: 3 });
  });

  it("processSessionEvents handles an empty batch", async () => {
    const result = await provider.processSessionEvents([]);
    expect(result).toEqual({ acknowledged: 0 });
  });
});
