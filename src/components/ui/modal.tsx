import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

export const Modal = DialogPrimitive.Root;
export const ModalTrigger = DialogPrimitive.Trigger;
export const ModalClose = DialogPrimitive.Close;
export const ModalPortal = DialogPrimitive.Portal;

export const ModalOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function ModalOverlay({ className, ...rest }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...rest}
    />
  );
});

// Centering: `left-1/2 -translate-x-1/2` is intentional and direction-agnostic.
// The modal's left edge sits at 50% of the viewport width, then the element shifts
// 50% of its own width leftward — net result is centered in BOTH LTR and RTL.
// Logical `start-1/2 -translate-x-1/2` would NOT center in RTL (start = right edge
// at 50%, then translateX(-50%) leaves it off-center to the left). Mirrors shadcn.
const modalContentVariants = cva(
  "fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-surface-lowest shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:duration-[250ms]",
  {
    variants: {
      size: {
        sm: "max-w-sm",
        md: "max-w-lg",
        lg: "max-w-2xl",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

export interface ModalContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof modalContentVariants> {
  /** Render the default backdrop overlay (true by default). */
  withOverlay?: boolean;
}

export const ModalContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ModalContentProps
>(function ModalContent(
  { className, children, size = "md", withOverlay = true, ...rest },
  ref,
) {
  return (
    <ModalPortal>
      {withOverlay && <ModalOverlay />}
      <DialogPrimitive.Content
        ref={ref}
        className={cn(modalContentVariants({ size }), className)}
        {...rest}
      >
        {children}
      </DialogPrimitive.Content>
    </ModalPortal>
  );
});

export const ModalHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { tone?: "default" | "danger" }
>(function ModalHeader({ className, tone = "default", ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-row items-center justify-between gap-3 border-b border-linen-border p-5",
        tone === "danger" ? "bg-danger/5" : "bg-linen",
        className,
      )}
      {...rest}
    />
  );
});

export const ModalTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function ModalTitle({ className, ...rest }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "font-display text-lg font-bold text-primary-container",
        className,
      )}
      {...rest}
    />
  );
});

export const ModalDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function ModalDescription({ className, ...rest }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-on-surface-variant", className)}
      {...rest}
    />
  );
});

export const ModalBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ModalBody({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn("p-6 max-h-[70vh] overflow-y-auto text-sm text-on-surface", className)}
        {...rest}
      />
    );
  },
);

export const ModalFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ModalFooter({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-row-reverse items-center gap-2 border-t border-linen-border bg-surface-low p-4",
          className,
        )}
        {...rest}
      />
    );
  },
);

export { modalContentVariants };
