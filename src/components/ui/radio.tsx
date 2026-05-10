import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";
import { cn } from "@/lib/cn";

export const RadioGroup = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Root>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup({ className, ...rest }, ref) {
  return (
    <RadioGroupPrimitive.Root
      ref={ref}
      className={cn("flex flex-col gap-2", className)}
      {...rest}
    />
  );
});

export const RadioGroupItem = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function RadioGroupItem({ className, ...rest }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-linen-border bg-surface-lowest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fixed-dim focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-primary-container",
        "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/40",
        className,
      )}
      {...rest}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <span className="h-2.5 w-2.5 rounded-full bg-primary-container" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
