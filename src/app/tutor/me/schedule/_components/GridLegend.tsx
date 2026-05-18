// Color legend strip — placed RIGHT ABOVE the schedule grid in both
// Tab 1 (recurring) and Tab 2 (calendar). Founder direction 2026-05-18.
//
// Always-visible, single short row. Optional `hint` slot for the drag
// instruction text on the leading edge of the trailing region.

interface GridLegendProps {
  hint?: string;
}

export function GridLegend({ hint }: GridLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-linen-border bg-linen px-3 py-2 text-xs text-secondary">
      <span className="font-bold text-on-surface">מקרא:</span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded bg-success" aria-hidden="true" />
        זמין (שמור)
      </span>
      <span className="flex items-center gap-1">
        <span
          className="h-3 w-3 rounded bg-success/40"
          style={{ outline: "1px solid var(--success, #059669)" }}
          aria-hidden="true"
        />
        זמין (טרם נשמר)
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded bg-surface-container" aria-hidden="true" />
        לא זמין
      </span>
      {hint && <span className="ms-auto text-[11px]">{hint}</span>}
    </div>
  );
}
