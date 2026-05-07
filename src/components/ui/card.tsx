import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const cardVariants = cva(
  "rounded-2xl border bg-surface-lowest shadow-sm transition",
  {
    variants: {
      tone: {
        default: "border-linen-border",
        error: "border-danger/40 bg-danger/5",
      },
      padding: {
        none: "p-0",
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
      },
      interactive: {
        true: "cursor-pointer hover:border-primary-container/40 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-accent",
        false: "",
      },
    },
    defaultVariants: {
      tone: "default",
      padding: "md",
      interactive: false,
    },
    compoundVariants: [
      {
        interactive: true,
        className: "aria-disabled:pointer-events-none aria-disabled:opacity-60",
      },
    ],
  },
);

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  disabled?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, tone, padding, interactive, disabled, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-disabled={disabled || undefined}
      className={cn(cardVariants({ tone, padding, interactive }), className)}
      {...rest}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...rest }, ref) {
    return <div ref={ref} className={cn("mb-3 flex flex-col gap-1", className)} {...rest} />;
  },
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...rest }, ref) {
    return (
      <h3
        ref={ref}
        className={cn("font-display text-lg font-bold text-primary-container", className)}
        {...rest}
      />
    );
  },
);

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...rest }, ref) {
    return (
      <p ref={ref} className={cn("text-sm text-on-surface-variant", className)} {...rest} />
    );
  },
);

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, ...rest }, ref) {
    return <div ref={ref} className={cn("text-sm text-on-surface", className)} {...rest} />;
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
