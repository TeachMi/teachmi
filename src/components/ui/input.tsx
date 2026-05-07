import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const inputVariants = cva(
  "block w-full rounded-lg border bg-surface-lowest text-on-surface placeholder:text-outline transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-accent disabled:cursor-not-allowed disabled:bg-surface-low disabled:text-on-surface-variant",
  {
    variants: {
      tone: {
        default: "border-linen-border focus-visible:border-primary-container",
        error: "border-danger focus-visible:border-danger",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-3 text-sm",
        lg: "h-12 px-4 text-base",
      },
    },
    defaultVariants: {
      tone: "default",
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
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;
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
        className={cn(inputVariants({ tone: resolvedTone, size }), className)}
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
