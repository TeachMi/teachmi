import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fixed-dim disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary-container text-on-primary shadow-sm hover:bg-primary",
        outline:
          "border border-linen-border bg-surface-lowest text-on-surface hover:border-primary-fixed-dim",
        accent:
          "bg-tertiary-fixed text-on-tertiary-fixed-variant shadow-md hover:scale-105 transition-transform font-display",
        ghost:
          "bg-transparent text-on-surface-variant hover:text-primary-container hover:bg-surface-container",
        danger: "bg-danger text-white shadow-sm hover:bg-red-700",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-lg",
        md: "h-10 px-5 text-sm rounded-lg",
        lg: "h-12 px-6 text-base rounded-xl",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  iconLeading?: ReactNode;
  iconTrailing?: ReactNode;
  fullWidth?: boolean;
  /** Render as the child element (e.g. a `<Link>`) while keeping the same styles and props.
   *  Disables `loading` (the asChild target controls its own content). */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    loading = false,
    iconLeading,
    iconTrailing,
    fullWidth = false,
    asChild = false,
    disabled,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const composedClassName = cn(
    buttonVariants({ variant, size }),
    fullWidth && "w-full",
    className,
  );

  if (asChild) {
    return (
      <Slot ref={ref} className={composedClassName} {...rest}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={composedClassName}
      {...rest}
    >
      {loading ? (
        <Spinner aria-hidden="true" />
      ) : (
        iconLeading && (
          <span className="inline-flex shrink-0" aria-hidden="true">
            {iconLeading}
          </span>
        )
      )}
      <span>{children}</span>
      {!loading && iconTrailing && (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {iconTrailing}
        </span>
      )}
    </button>
  );
});

function Spinner(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="animate-spin"
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  );
}

export { buttonVariants };
