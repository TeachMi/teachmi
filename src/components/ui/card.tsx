import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const cardVariants = cva("bg-surface-lowest transition-colors", {
  variants: {
    tone: {
      default: "border border-linen-border",
      highlighted: "border-2 border-primary-fixed-dim",
      success: "border border-primary-fixed-dim bg-primary-fixed/30",
      error: "border border-danger/40 bg-danger/5",
    },
    radius: {
      lg: "rounded-lg",
      xl: "rounded-xl",
      "2xl": "rounded-2xl",
    },
    padding: {
      none: "p-0",
      sm: "p-4",
      md: "p-6",
      lg: "p-8",
    },
    interactive: {
      true: "cursor-pointer hover:shadow-lg hover:border-primary-fixed-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fixed-dim",
      false: "",
    },
    shadow: {
      none: "",
      sm: "shadow-sm",
      md: "shadow-md",
      lg: "shadow-lg",
    },
  },
  defaultVariants: {
    tone: "default",
    radius: "xl",
    padding: "md",
    interactive: false,
    shadow: "none",
  },
  compoundVariants: [
    {
      interactive: true,
      className: "aria-disabled:pointer-events-none aria-disabled:opacity-60",
    },
  ],
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  disabled?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, tone, radius, padding, interactive, shadow, disabled, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-disabled={disabled || undefined}
      className={cn(
        cardVariants({ tone, radius, padding, interactive, shadow }),
        className,
      )}
      {...rest}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...rest }, ref) {
    return (
      <div ref={ref} className={cn("mb-3 flex flex-col gap-1", className)} {...rest} />
    );
  },
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...rest }, ref) {
    return (
      <h3
        ref={ref}
        className={cn(
          "font-display text-lg font-bold text-primary-container",
          className,
        )}
        {...rest}
      />
    );
  },
);

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...rest }, ref) {
  return <p ref={ref} className={cn("text-sm text-secondary", className)} {...rest} />;
});

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, ...rest }, ref) {
    return (
      <div ref={ref} className={cn("text-sm text-on-surface", className)} {...rest} />
    );
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...rest }, ref) {
    return (
      <div ref={ref} className={cn("mt-4 flex items-center gap-3", className)} {...rest} />
    );
  },
);

export { cardVariants };
