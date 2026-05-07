import { getProviderName } from "../../feature-flags/env-flags";
import { StubLessonRoomProvider } from "./stub";
import type { LessonRoomProvider } from "./types";

export type {
  CreateRoomInput,
  IssueRoomTokenInput,
  LessonParticipantRole,
  LessonRoomProvider,
  ProcessSessionEventsResult,
  RoomHandle,
  RoomMetadata,
  RoomStatus,
  RoomToken,
  SessionEvent,
} from "./types";

export function getLessonRoomProvider(): LessonRoomProvider {
  const name = getProviderName("lessonRoom");

  if (name === "stub") {
    return new StubLessonRoomProvider();
  }

  throw new Error(
    `LessonRoomProvider "${name}" is not yet implemented. Daily.co integration lands in Story 5.1.`,
  );
}
