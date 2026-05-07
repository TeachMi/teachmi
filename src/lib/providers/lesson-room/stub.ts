import type {
  CreateRoomInput,
  IssueRoomTokenInput,
  LessonRoomProvider,
  ProcessSessionEventsResult,
  RoomHandle,
  RoomMetadata,
  RoomToken,
  SessionEvent,
} from "./types";

/**
 * Deterministic fake room provider. URLs and tokens are seeded from the
 * application-side lesson/user/room IDs. Real Daily.co integration lands in
 * Story 5.1.
 */
export class StubLessonRoomProvider implements LessonRoomProvider {
  async createRoom(input: CreateRoomInput): Promise<RoomHandle> {
    return {
      roomId: `stub-room-${input.lessonId}`,
      roomUrl: `/dev/stub-room/${input.lessonId}`,
    };
  }

  async issueRoomToken(input: IssueRoomTokenInput): Promise<RoomToken> {
    return {
      token: `stub-token-${input.roomId}-${input.userId}`,
      expiresAt: "2099-01-01T00:00:00.000Z",
    };
  }

  async getRoomMetadata(roomId: string): Promise<RoomMetadata> {
    return {
      roomId,
      status: "ready",
      participantCount: 0,
    };
  }

  async processSessionEvents(
    events: SessionEvent[],
  ): Promise<ProcessSessionEventsResult> {
    return { acknowledged: events.length };
  }
}
