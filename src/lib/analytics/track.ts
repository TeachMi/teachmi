// Minimal track() wrapper authored by Story 1.13.
// No-ops gracefully when NEXT_PUBLIC_POSTHOG_KEY is unset (dev / test safety).
// When the key IS set, currently logs to the console as a structured one-line JSON
// — Story 1.8 will replace this with real posthog-js (client) / posthog-node (server)
// transports. Until then, dev visibility comes via console.
//
// Safe to call from both client and server contexts.

import type { AnalyticsEvent } from "./events";

export interface TrackLogger {
  log(payload: Record<string, unknown>): void;
}

const defaultLogger: TrackLogger = {
  log(payload) {
    console.log(JSON.stringify(payload));
  },
};

function getPostHogKey(): string | undefined {
  // NEXT_PUBLIC_* keys are inlined at build time for client bundles and available
  // server-side via process.env. Either context returns the same string.
  return process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || undefined;
}

export function track(event: AnalyticsEvent, logger: TrackLogger = defaultLogger): void {
  if (!getPostHogKey()) {
    return;
  }

  logger.log({ kind: "analytics.track", ...event });
}
