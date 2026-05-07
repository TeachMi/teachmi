/**
 * LessonRoomProvider — strategy interface for the video-call vendor.
 * MVP 1: StubLessonRoomProvider (fake room URL + tokens). MVP 2: Daily.co
 * (Story 5.1) with LiveKit/Whereby contracts as fallback (AR-30).
 *
 * Selection via LESSON_ROOM_PROVIDER env-var.
 */

export type LessonParticipantRole = "tutor" | "student" | "admin";
export type RoomStatus = "ready" | "in-progress" | "ended";

export interface CreateRoomInput {
  lessonId: string;
  /** 45 or 60 at MVP per FR25; vendor decides max-duration enforcement. */
  durationMin: 45 | 60;
}

export interface RoomHandle {
  roomId: string;
  /** Either an absolute https:// URL (vendor-hosted) or a relative app path (stub). */
  roomUrl: string;
}

export interface IssueRoomTokenInput {
  roomId: string;
  userId: string;
  role: LessonParticipantRole;
}

export interface RoomToken {
  token: string;
  /** ISO 8601 UTC timestamp. */
  expiresAt: string;
}

export interface RoomMetadata {
  roomId: string;
  status: RoomStatus;
  participantCount: number;
}

export interface SessionEvent {
  type: "started" | "joined" | "left" | "ended";
  /** ISO 8601 UTC timestamp. */
  at: string;
  userId?: string;
  /** Vendor-issued event id, used for idempotency on the consumer side. */
  vendorEventId: string;
}

export interface ProcessSessionEventsResult {
  acknowledged: number;
}

export interface LessonRoomProvider {
  createRoom(input: CreateRoomInput): Promise<RoomHandle>;
  issueRoomToken(input: IssueRoomTokenInput): Promise<RoomToken>;
  getRoomMetadata(roomId: string): Promise<RoomMetadata>;
  processSessionEvents(events: SessionEvent[]): Promise<ProcessSessionEventsResult>;
}
