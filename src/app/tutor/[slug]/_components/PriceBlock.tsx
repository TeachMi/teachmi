// Lesson-length price tiles for the public tutor profile (Story 3.2 +
// Story 2.10 follow-up 2026-05-17). RSC. Renders only the lengths the
// tutor opted into — each is its own tile with vertical-divider separators
// between them.
//
// RTL FLEX NOTE: uses plain `flex` (NOT `flex-row-reverse`). In RTL
// writing mode, flex-row already flows right-to-left — the first DOM
// child renders on the RIGHT edge. The tiles are sorted ASCENDING by
// minutes (45 → 60 → 75 → 90); in RTL that means the shortest length
// sits on the leading (right) edge, matching the mock convention.

import { formatIlsCurrency } from "@/lib/hebrew/format";

interface PriceBlockProps {
  hourlyPriceIls: number | null;
  lesson45PriceIls: number | null;
  lesson75PriceIls: number | null;
  lesson90PriceIls: number | null;
}

export function PriceBlock({
  hourlyPriceIls,
  lesson45PriceIls,
  lesson75PriceIls,
  lesson90PriceIls,
}: PriceBlockProps) {
  // Build the offered set in canonical minutes-ascending order.
  const tiles: Array<{ minutes: 45 | 60 | 75 | 90; price: number }> = [];
  if (lesson45PriceIls !== null) tiles.push({ minutes: 45, price: lesson45PriceIls });
  if (hourlyPriceIls !== null) tiles.push({ minutes: 60, price: hourlyPriceIls });
  if (lesson75PriceIls !== null) tiles.push({ minutes: 75, price: lesson75PriceIls });
  if (lesson90PriceIls !== null) tiles.push({ minutes: 90, price: lesson90PriceIls });

  if (tiles.length === 0) {
    // Defensive: shouldn't happen for a discoverable tutor (the form
    // requires ≥1 length). Render nothing rather than an empty box.
    return null;
  }

  return (
    <div className="bg-linen border border-linen-border rounded-xl p-4 flex flex-wrap items-stretch gap-6">
      {tiles.map((tile, idx) => (
        <div key={tile.minutes} className="flex items-stretch gap-6">
          <div className="text-start">
            <div className="text-xs text-secondary mb-1">שיעור {tile.minutes} דק׳</div>
            <div className="font-display font-bold text-2xl text-primary-container">
              {formatIlsCurrency(tile.price)}
            </div>
          </div>
          {idx < tiles.length - 1 && (
            <div className="w-px bg-linen-border" aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  );
}
