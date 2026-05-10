// TODO(story 3.4): Add Combobox variant — multi-select + free-text search.
//   Defer until 3.4 designs the actual filter row; speculative API will rot.

import * as SelectPrimitive from "@radix-ui/react-select";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

const ChevronDown = (props: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={props.className}
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const ChevronUp = (props: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={props.className}
  >
    <path d="m18 15-6-6-6 6" />
  </svg>
);

const Check = (props: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
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

type SelectTriggerVariant = "default" | "error";

export interface SelectTriggerProps
  extends ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> {
  tone?: SelectTriggerVariant;
  size?: "sm" | "md" | "lg";
}

const triggerSizeClasses: Record<NonNullable<SelectTriggerProps["size"]>, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-4 text-base",
};

export const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(function SelectTrigger(
  { className, children, tone = "default", size = "md", ...rest },
  ref,
) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex w-full items-center justify-between gap-2 rounded-lg border bg-surface-lowest text-on-surface transition-colors focus:outline-none focus:ring-2 focus:ring-primary-fixed-dim focus:border-primary-fixed-dim disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-outline",
        tone === "error"
          ? "border-danger focus:ring-danger/40 focus:border-danger"
          : "border-linen-border",
        triggerSizeClasses[size],
        className,
      )}
      {...rest}
    >
      <span className="truncate text-start">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="text-on-surface-variant rtl:-scale-x-100" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent(
  { className, children, position = "popper", sideOffset = 4, ...rest },
  ref,
) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-linen-border bg-surface-lowest text-on-surface shadow-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className,
        )}
        {...rest}
      >
        <SelectPrimitive.ScrollUpButton className="flex items-center justify-center py-1 text-on-surface-variant">
          <ChevronUp />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1 max-h-[min(20rem,var(--radix-select-content-available-height))]">
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex items-center justify-center py-1 text-on-surface-variant">
          <ChevronDown />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...rest }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn(
        "px-3 py-1.5 text-xs font-bold text-on-surface-variant",
        className,
      )}
      {...rest}
    />
  );
});

export interface SelectItemProps
  extends ComponentPropsWithoutRef<typeof SelectPrimitive.Item> {
  children: ReactNode;
}

export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  SelectItemProps
>(function SelectItem({ className, children, ...rest }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-md py-2 ps-8 pe-3 text-sm text-on-surface outline-none transition-colors data-[highlighted]:bg-surface-container data-[state=checked]:font-bold data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...rest}
    >
      <span className="absolute start-2 inline-flex h-4 w-4 items-center justify-center text-primary-container">
        <SelectPrimitive.ItemIndicator>
          <Check />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});

export const SelectSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...rest }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn("my-1 h-px bg-linen-border", className)}
      {...rest}
    />
  );
});
