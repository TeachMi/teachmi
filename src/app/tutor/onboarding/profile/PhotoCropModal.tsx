"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const croppedAreaPixelsRef = useRef<Area | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the picked file into an object URL once; revoke on unmount.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
  }, []);

  async function handleConfirm() {
    if (!imageSrc || !croppedAreaPixelsRef.current) return;
    setBusy(true);
    try {
      const blob = await cropImageToBlob(imageSrc, croppedAreaPixelsRef.current);
      onConfirm(blob);
    } catch (err) {
      console.error("[PhotoCropModal] crop failed", err);
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
          {imageSrc && (
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
          )}
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
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for cropping."));
    img.src = src;
  });
}
