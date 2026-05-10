import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes, type MouseEvent } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 font-bold transition-colors whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-surface-container text-on-surface",
        subtle: "bg-linen text-on-surface-variant",
        // Tutor status
        pending: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
        approved: "bg-primary-fixed text-primary-container",
        suspended: "bg-warning/15 text-warning",
        rejected: "bg-danger/15 text-danger",
        // Lesson status
        scheduled: "bg-primary-fixed/40 text-primary-container",
        "in-progress": "bg-primary-container text-on-primary",
        completed: "bg-primary-fixed text-primary-container",
        cancelled: "bg-surface-high text-on-surface-variant line-through",
        "no-show": "bg-danger/15 text-danger",
        // Generic
        subject: "bg-primary-fixed/40 text-primary-container",
        count: "bg-surface-container text-on-surface border border-linen-border",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px] rounded",
        md: "px-2.5 py-1 text-xs rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** When provided, renders an end-aligned × close button (used for filter chips). */
  onRemove?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Accessible label for the close button when `onRemove` is provided. */
  removeLabel?: string;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant, size, children, onRemove, removeLabel = "הסר", ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size }), className)}
      {...rest}
    >
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(event);
          }}
          className="-me-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full hover:bg-current/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-1 focus-visible:ring-offset-current/20"
        >
          <svg
            viewBox="0 0 24 24"
            width="0.7em"
            height="0.7em"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6 18 18M6 18 18 6" />
          </svg>
        </button>
      )}
    </span>
  );
});

export { badgeVariants };
