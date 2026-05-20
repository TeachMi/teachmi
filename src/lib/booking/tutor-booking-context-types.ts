// Plain types + sync helpers for the tutor-booking-context server action.
// Server Actions ("use server" modules) can only export async functions,
// so the type + serializer live in a sibling module.

import type { SlotStatesByDay } from "@/lib/availability/compute-slots";

export type LessonDurationMinutes = 45 | 60 | 75 | 90;

export interface SerializedSlot {
  startIsoUtc: string;
  localTime: string;
  status: "available" | "booked" | "unavailable";
}

export interface TutorBookingContext {
  tutorUserId: string;
  displayName: string;
  profilePhotoUrl: string | null;
  prices: Record<LessonDurationMinutes, number | null>;
  /** Serialized to plain JSON-safe shape for transport across the action boundary. */
  slotStates: Array<[string, SerializedSlot[]]>;
  /** ISO string of `weekStartUtc` — caller rehydrates to `Date`. */
  weekStartUtcIso: string;
  isSignedIn: boolean;
  initialDuration: LessonDurationMinutes;
  hasAnyAvailability: boolean;
  /** True when the viewer is the tutor themselves — caller should render the "this is you" empty state. */
  viewerIsOwner: boolean;
}

/**
 * Per-render bridge: `BookingModal` expects `slotStates: SlotStatesByDay`
 * (`Map<string, SlotState[]>`). Server Actions can only return JSON-safe
 * values, so we serialize to `Array<[key, value[]]>` and rehydrate here.
 */
export function rehydrateSlotStates(
  serialized: Array<[string, SerializedSlot[]]>,
): SlotStatesByDay {
  return new Map(serialized) as SlotStatesByDay;
}
