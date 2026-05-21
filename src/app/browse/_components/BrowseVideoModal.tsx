"use client";

// Lightweight video preview modal mounted from the BrowseRow hover panel.
// Story 5.x 2026-05-19. Mirrors `mocks/browse-v2.html` video-modal: top
// header with tutor name + close, video area, footer with "ראו פרופיל
// מלא" + "קביעת שיעור".
//
// Why a fresh component instead of reusing IntroVideoPlayer: the inline
// player on the public profile assumes its surrounding layout for sizing
// + Hero-context CTAs. The browse-modal needs its own chrome (overlay +
// footer + close) and a simpler video element. Sharing would couple two
// surfaces that have different empty-states and dismiss behavior.

import { useEffect } from "react";

interface BrowseVideoModalProps {
  videoUrl: string;
  displayName: string;
  tagline: string | null;
  /** Used by the footer "ראו פרופיל מלא" link. */
  profileHref: string;
  /**
   * Whether the viewer may book. `false` for logged-in tutors — the
   * footer "קביעת שיעור" button is hidden and the profile link spans
   * the full footer. Defaults to `true`.
   */
  canBook?: boolean;
  onClose: () => void;
  /** Called when the student clicks "קביעת שיעור" — opens the booking modal. */
  onBookClick: () => void;
}

export function BrowseVideoModal({
  videoUrl,
  displayName,
  tagline,
  profileHref,
  canBook = true,
  onClose,
  onBookClick,
}: BrowseVideoModalProps) {
  // Escape closes; body scroll lock while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="browse-video-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-linen-border flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center"
            aria-label="סגירה"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          <div className="text-start">
            <h4
              id="browse-video-modal-title"
              className="font-display font-bold text-on-surface"
            >
              {displayName}
            </h4>
            {tagline && <p className="text-xs text-secondary mt-0.5">{tagline}</p>}
          </div>
        </div>

        {/* Video */}
        <div className="relative aspect-video bg-black">
          {/* The R2 URL is already presigned by the server. The browser
              streams directly — no client-side decryption / auth. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={videoUrl}
            controls
            autoPlay
            playsInline
            className="w-full h-full object-contain bg-black"
          />
        </div>

        {/* Actions */}
        <div className="p-4 flex gap-2 border-t border-linen-border">
          {canBook && (
            <button
              type="button"
              onClick={onBookClick}
              className="flex-1 bg-primary-container hover:bg-primary text-on-primary text-center text-sm font-bold py-2.5 rounded-lg transition-colors"
            >
              קביעת שיעור
            </button>
          )}
          <a
            href={profileHref}
            className="flex-1 text-sm text-on-surface border border-linen-border hover:border-primary-fixed-dim hover:bg-linen text-center font-bold py-2.5 rounded-lg transition-colors"
          >
            ראו פרופיל מלא
          </a>
        </div>
      </div>
    </div>
  );
}
