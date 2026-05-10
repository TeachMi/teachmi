import * as SwitchPrimitive from "@radix-ui/react-switch";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";
import { cn } from "@/lib/cn";

export type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(function Switch({ className, ...rest }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fixed-dim focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=unchecked]:bg-surface-container",
        "data-[state=checked]:bg-primary-container",
        className,
      )}
      {...rest}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-surface-lowest shadow-lg ring-0 transition-transform",
          // Logical-property RTL handling: thumb sits at the start edge when off,
          // slides to the end edge when on. Tailwind v4's `start-*`/`end-*`
          // do not exist for transforms; use the `rtl:` variant on translate.
          "data-[state=unchecked]:translate-x-0",
          "data-[state=checked]:translate-x-5 data-[state=checked]:rtl:-translate-x-5",
        )}
      />
    </SwitchPrimitive.Root>
  );
});
