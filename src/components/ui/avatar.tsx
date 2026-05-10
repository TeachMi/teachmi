import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";
import { cn } from "@/lib/cn";

const avatarVariants = cva(
  "relative inline-flex shrink-0 overflow-hidden rounded-full bg-surface-container text-on-surface-variant",
  {
    variants: {
      size: {
        xs: "h-6 w-6 text-[10px]",
        sm: "h-8 w-8 text-xs",
        md: "h-10 w-10 text-sm",
        lg: "h-14 w-14 text-base",
        xl: "h-20 w-20 text-xl",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

function firstCodePoint(token: string): string {
  for (const ch of token) return ch;
  return "";
}

function getInitials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  const first = firstCodePoint(tokens[0]!);
  const last = tokens.length > 1 ? firstCodePoint(tokens[tokens.length - 1]!) : "";
  const combined = `${first}${last}`;
  return /[a-z]/i.test(combined) ? combined.toUpperCase() : combined;
}

export interface AvatarProps
  extends ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {
  /** Image URL. Falls back to initials on load failure. */
  src?: string;
  /** Display name — used as `alt` text and to derive initials for the fallback. */
  name: string;
  /** Render an outer ring (e.g. "active speaker" / "selected"). */
  ring?: boolean;
}

export const Avatar = forwardRef<
  ElementRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(function Avatar({ className, size, src, name, ring, ...rest }, ref) {
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        avatarVariants({ size }),
        ring && "ring-2 ring-primary-fixed-dim ring-offset-2 ring-offset-surface",
        className,
      )}
      {...rest}
    >
      {src && (
        <AvatarPrimitive.Image
          src={src}
          alt={name}
          className="h-full w-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback
        className="flex h-full w-full items-center justify-center font-bold uppercase"
        delayMs={src ? 600 : 0}
        aria-label={name.trim() || "User"}
      >
        {getInitials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
});

export { avatarVariants };
