import { cva, type VariantProps } from "class-variance-authority";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

const textareaVariants = cva(
  "block w-full rounded-lg border text-on-surface placeholder:text-outline transition-colors focus:outline-none focus:ring-2 focus:ring-primary-fixed-dim focus:border-primary-fixed-dim disabled:cursor-not-allowed disabled:opacity-60 resize-none",
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

type TextareaBaseProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size">;

export interface TextareaProps
  extends TextareaBaseProps,
    VariantProps<typeof textareaVariants> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Auto-resize the textarea to fit content; minRows / maxRows clamp the visible height. */
  autoGrow?: boolean;
  minRows?: number;
  maxRows?: number;
  /** When set, render a `current / max` count below the textarea. */
  maxLength?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
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
      autoGrow = false,
      minRows = 3,
      maxRows = 10,
      maxLength,
      value,
      defaultValue,
      onChange,
      "aria-describedby": ariaDescribedBy,
      ...rest
    },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const countId = maxLength ? `${inputId}-count` : undefined;
    const describedBy =
      [ariaDescribedBy, hintId, errorId, countId].filter(Boolean).join(" ") ||
      undefined;
    const resolvedTone = error ? "error" : tone;

    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

    const isControlled = value !== undefined;
    const initialString =
      typeof value === "string"
        ? value
        : typeof defaultValue === "string"
          ? defaultValue
          : "";
    const [internalValue, setInternalValue] = useState(initialString);
    const currentValue = isControlled ? String(value ?? "") : internalValue;
    const currentLength = currentValue.length;

    const resize = useCallback(() => {
      const node = innerRef.current;
      if (!node) return;
      node.style.height = "auto";
      const lineHeight =
        parseFloat(getComputedStyle(node).lineHeight || "20") || 20;
      const paddingY =
        parseFloat(getComputedStyle(node).paddingTop || "0") +
        parseFloat(getComputedStyle(node).paddingBottom || "0");
      const minHeight = lineHeight * minRows + paddingY;
      const maxHeight = lineHeight * maxRows + paddingY;
      const target = Math.max(minHeight, Math.min(node.scrollHeight, maxHeight));
      node.style.height = `${target}px`;
      node.style.overflowY = node.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [minRows, maxRows]);

    useLayoutEffect(() => {
      if (autoGrow) resize();
    }, [autoGrow, resize, currentValue]);

    useEffect(() => {
      if (!autoGrow) return;
      const handler = () => resize();
      window.addEventListener("resize", handler);
      return () => window.removeEventListener("resize", handler);
    }, [autoGrow, resize]);

    const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
      if (!isControlled) setInternalValue(event.target.value);
      onChange?.(event);
    };

    const showCount = typeof maxLength === "number";
    const overSoft = showCount && currentLength > maxLength * 0.9;
    const overHard = showCount && currentLength >= maxLength;

    return (
      <div className="flex flex-col gap-1.5 text-start">
        {label && (
          <label htmlFor={inputId} className="text-sm font-bold text-on-surface">
            {label}
          </label>
        )}
        <textarea
          ref={innerRef}
          id={inputId}
          rows={autoGrow ? minRows : rest.rows ?? minRows}
          disabled={disabled}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={isControlled ? value : undefined}
          defaultValue={isControlled ? undefined : defaultValue}
          onChange={handleChange}
          className={cn(
            textareaVariants({ tone: resolvedTone, surface, size }),
            className,
          )}
          {...rest}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
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
          {showCount && (
            <p
              id={countId}
              className={cn(
                "text-xs text-on-surface-variant tabular-nums shrink-0",
                overSoft && "text-danger",
                overHard && "font-bold",
              )}
              aria-live={overSoft ? "polite" : "off"}
            >
              {currentLength} / {maxLength}
            </p>
          )}
        </div>
      </div>
    );
  },
);

export { textareaVariants };
