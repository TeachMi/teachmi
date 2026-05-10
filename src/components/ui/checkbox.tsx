import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

const CheckIcon = (props: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="0.85em"
    height="0.85em"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={props.className}
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const Dash = (props: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="0.85em"
    height="0.85em"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={props.className}
  >
    <path d="M5 12h14" />
  </svg>
);

export type CheckboxProps = ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>;

export const Checkbox = forwardRef<
  ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(function Checkbox({ className, checked, defaultChecked, ...rest }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      checked={checked}
      defaultChecked={defaultChecked}
      className={cn(
        "peer inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-linen-border bg-surface-lowest text-on-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fixed-dim focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary-container data-[state=checked]:border-primary-container",
        "data-[state=indeterminate]:bg-primary-container data-[state=indeterminate]:border-primary-container",
        "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/40",
        className,
      )}
      {...rest}
    >
      <CheckboxPrimitive.Indicator className="group/cb text-on-primary">
        <CheckIcon className="hidden group-data-[state=checked]/cb:block" />
        <Dash className="hidden group-data-[state=indeterminate]/cb:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

export interface CheckboxFieldProps extends CheckboxProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export const CheckboxField = forwardRef<
  ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxFieldProps
>(function CheckboxField(
  { id, label, hint, error, className, "aria-describedby": ariaDescribedBy, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy =
    [ariaDescribedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5 text-start">
      <div className="flex items-start gap-2.5">
        <Checkbox
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn("mt-0.5", className)}
          {...rest}
        />
        <label
          htmlFor={inputId}
          className="text-sm text-on-surface leading-relaxed cursor-pointer select-none"
        >
          {label}
        </label>
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-on-surface-variant ps-7">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="text-xs font-bold text-danger ps-7"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
});
