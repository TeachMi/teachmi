"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";

interface PhotoCropModalProps {
  /** The File the user just picked. Modal owns the lifecycle of the object URL. */
  file: File;
  /** Called with the cropped JPEG blob after the user clicks "Confirm". */
  onConfirm: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

/**
 * Circular crop + zoom UI for the tutor profile photo. Uses `react-easy-crop`
 * (5.5.7, ~12KB) for the gesture handling; we render the final crop to a
 * canvas to produce a square JPEG that fits the circular avatar.
 *
 * Why crop client-side rather than server-side? (a) gives the tutor a
 * live preview of what students will actually see in the marketplace browse
 * cards, (b) reduces the R2 byte cost by uploading a 400×400 instead of a
 * 12MP iPhone shot, (c) avoids needing image-processing libs on the server.
 */
export function PhotoCropModal({ file, onConfirm, onCancel }: PhotoCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const croppedAreaPixelsRef = useRef<Area | null>(null);
  const [busy, setBusy] = useState(false);
  // Code-review patch M6 (2026-05-13): block confirm until react-easy-crop
  // has fired `onCropComplete` at least once. Without this, a quick double-
  // click on "שמרו" before the cropper finished its initial layout would
  // hit the early-return in `handleConfirm` and the user would see no
  // feedback.
  const [cropReady, setCropReady] = useState(false);

  // Patch M7 (2026-05-13): derive the blob URL with `useMemo` (per-file
  // identity) and revoke from a cleanup-only effect. The previous shape
  // (`useState` + `setState(url)` inside `useEffect`) tripped the
  // `react-hooks/set-state-in-effect` ESLint rule.
  const imageSrc = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => {
    return () => URL.revokeObjectURL(imageSrc);
  }, [imageSrc]);

  // ESC to cancel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    croppedAreaPixelsRef.current = areaPixels;
    setCropReady(true);
  }, []);

  // Code-review patch M1 (2026-05-13): wrap in try/finally so `setBusy(false)`
  // ALWAYS runs. Previously busy stayed true on the success path, which
  // mattered if the parent re-rendered the modal post-confirm (e.g., a
  // second crop attempt while the previous blob upload was still in flight).
  async function handleConfirm() {
    if (!croppedAreaPixelsRef.current) return;
    setBusy(true);
    try {
      const blob = await cropImageToBlob(imageSrc, croppedAreaPixelsRef.current);
      onConfirm(blob);
    } catch (err) {
      console.error("[PhotoCropModal] crop failed", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="חיתוך תמונת פרופיל"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-surface-lowest shadow-xl">
        <div className="border-b border-linen-border px-6 py-4 text-start">
          <h3 className="font-display text-lg font-bold text-primary-container">
            חיתוך תמונת פרופיל
          </h3>
          <p className="text-xs text-on-surface-variant">
            גררו את התמונה להזיז · הזיזו את הסליידר להגדיל
          </p>
        </div>
        <div className="relative h-[360px] w-full bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="space-y-3 px-6 py-4">
          <label className="block text-start">
            <span className="text-xs font-bold text-on-surface">זום</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mt-1 w-full accent-primary-container"
              aria-label="זום"
            />
          </label>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={handleConfirm}
              size="md"
              fullWidth
              loading={busy}
              disabled={!cropReady}
            >
              שמרו את החיתוך
            </Button>
            <Button type="button" variant="outline" size="md" onClick={onCancel}>
              ביטול
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const OUTPUT_SIZE_PX = 400;

async function cropImageToBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE_PX;
  canvas.height = OUTPUT_SIZE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  // Draw the cropped region from the source image into the 400×400 canvas.
  // react-easy-crop returns the source-pixel rectangle in `area`.
  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    OUTPUT_SIZE_PX,
    OUTPUT_SIZE_PX,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null."));
      },
      "image/jpeg",
      0.9,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  // Patch M2 (2026-05-13): no `crossOrigin = "anonymous"`. This modal only
  // ever loads a `blob:` URL created locally from the picked File — blobs
  // don't need CORS, and setting `crossOrigin` on a blob URL triggered a
  // tainted-canvas SecurityError on some Safari builds. If a future caller
  // needs to crop a remote image, set crossOrigin THEN, not globally here.
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for cropping."));
    img.src = src;
  });
}
