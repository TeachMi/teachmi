import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const inputVariants = cva(
  "block w-full rounded-lg border text-on-surface placeholder:text-outline transition-colors focus:outline-none focus:ring-2 focus:ring-primary-fixed-dim focus:border-primary-fixed-dim disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      tone: {
        default: "border-linen-border",
        error: "border-danger focus:ring-danger/40 focus:border-danger",
      },
      surface: {
        white: "bg-surface-lowest",
        linen: "bg-linen",
      },
      size: {
        sm: "px-3 py-2 text-xs",
        md: "px-4 py-3 text-sm",
        lg: "px-4 py-3.5 text-base",
      },
    },
    defaultVariants: {
      tone: "default",
      surface: "white",
      size: "md",
    },
  },
);

type InputBaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size">;

export interface InputProps
  extends InputBaseProps,
    VariantProps<typeof inputVariants> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    tone,
    surface,
    size,
    label,
    hint,
    error,
    id,
    disabled,
    "aria-describedby": ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy =
    [ariaDescribedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;
  const resolvedTone = error ? "error" : tone;

  return (
    <div className="flex flex-col gap-1.5 text-start">
      {label && (
        <label htmlFor={inputId} className="text-sm font-bold text-on-surface">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(inputVariants({ tone: resolvedTone, surface, size }), className)}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-on-surface-variant">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-bold text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

export { inputVariants };
