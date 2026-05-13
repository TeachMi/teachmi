// Two-price card for the public tutor profile (Story 3.2). RSC.
// "Package of 10" tile from the mock is explicitly omitted — packages are
// Phase-2+ per locked product constraints.

import { formatIlsCurrency } from "@/lib/hebrew/format";

interface PriceBlockProps {
  hourlyPriceIls: number;
  lesson45PriceIls: number | null;
}

export function PriceBlock({ hourlyPriceIls, lesson45PriceIls }: PriceBlockProps) {
  return (
    <div className="bg-linen border border-linen-border rounded-xl p-4 flex flex-row-reverse gap-6">
      {lesson45PriceIls !== null && (
        <>
          <div className="text-start">
            <div className="text-xs text-secondary mb-1">שיעור 45 דק׳</div>
            <div className="font-display font-bold text-2xl text-primary-container">
              {formatIlsCurrency(lesson45PriceIls)}
            </div>
          </div>
          <div className="w-px bg-linen-border" aria-hidden="true" />
        </>
      )}
      <div className="text-start">
        <div className="text-xs text-secondary mb-1">שיעור 60 דק׳</div>
        <div className="font-display font-bold text-2xl text-primary-container">
          {formatIlsCurrency(hourlyPriceIls)}
        </div>
      </div>
    </div>
  );
}
