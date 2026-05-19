// 3-step horizontal progress chip strip per `mocks/checkout.html`.
// Step 1: בחירת זמן · Step 2: פרטי תשלום · Step 3: אישור.

interface CheckoutStepperProps {
  active: 1 | 2 | 3;
}

const STEPS: ReadonlyArray<{ id: 1 | 2 | 3; label: string }> = [
  { id: 1, label: "בחירת זמן" },
  { id: 2, label: "פרטי תשלום" },
  { id: 3, label: "אישור" },
];

export function CheckoutStepper({ active }: CheckoutStepperProps) {
  return (
    <div className="bg-white rounded-xl border border-linen-border p-4 mb-8">
      <ol className="flex items-center gap-3">
        {STEPS.map((step, idx) => {
          const isDone = step.id < active;
          const isActive = step.id === active;
          return (
            <li key={step.id} className="flex items-center gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={[
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                    isDone
                      ? "bg-primary-container text-on-primary"
                      : isActive
                        ? "bg-primary-container text-on-primary shadow-[0_0_0_4px_rgba(176,240,214,0.6)]"
                        : "bg-surface-high text-secondary",
                  ].join(" ")}
                >
                  {isDone ? (
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      check
                    </span>
                  ) : (
                    step.id
                  )}
                </span>
                <span
                  className={[
                    "text-sm font-bold",
                    isDone
                      ? "text-on-surface"
                      : isActive
                        ? "text-primary-container"
                        : "text-secondary",
                  ].join(" ")}
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={[
                    "flex-1 h-0.5",
                    isDone ? "bg-primary-container" : "bg-linen-border",
                  ].join(" ")}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
