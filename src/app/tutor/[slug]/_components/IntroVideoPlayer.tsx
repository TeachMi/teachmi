"use client";

// Minimal intro-video player for the public tutor profile (Story 3.2).
// Native HTML5 video — no third-party player. Renders an aspect-video frame
// with a play-icon overlay until the user clicks play.
//
// `preload="metadata"` (NOT `auto`) is load-bearing — AR-22 requires ≥95%
// lesson completion on Israeli periphery internet (Eilat / Kiryat Shmona /
// Be'er Sheva). Auto-preload would burn bandwidth before the user actually
// chose to play.

import { useState } from "react";

interface IntroVideoPlayerProps {
  src: string;
  poster?: string;
  tutorName: string;
}

export function IntroVideoPlayer({ src, poster, tutorName }: IntroVideoPlayerProps) {
  const [hasPlayed, setHasPlayed] = useState(false);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-linen-border shadow-md aspect-video bg-on-surface/5">
      <video
        className="w-full h-full object-cover"
        src={src}
        poster={poster}
        controls
        preload="metadata"
        playsInline
        onPlay={() => setHasPlayed(true)}
        aria-label={`סרטון היכרות של ${tutorName}`}
      >
        {/* Browsers without <video> support get a textual fallback. */}
        הדפדפן שלכם אינו תומך בנגן וידאו. ניתן לצפות בסרטון{" "}
        <a href={src} className="underline">
          בקישור ישיר
        </a>
        .
      </video>

      {!hasPlayed && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30"
          aria-hidden="true"
        >
          <div className="w-20 h-20 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-xl">
            <span
              className="material-symbols-outlined text-primary-container text-4xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              play_arrow
            </span>
          </div>
        </div>
      )}

      <div className="absolute bottom-3 end-3 bg-black/60 backdrop-blur text-white text-xs px-2 py-1 rounded">
        סרטון היכרות
      </div>
    </div>
  );
}
