"use client";

import { DirectionProvider } from "@radix-ui/react-direction";
import type { ReactNode } from "react";

/**
 * Client wrapper that supplies direction context to all Radix UI primitives.
 * Without this, Radix primitives (Select, Dialog, etc.) default their internal
 * `dir` to "ltr" and ignore the document's `<html dir="rtl">` attribute,
 * which breaks RTL geometry (chevron flip, popper positioning, etc.).
 */
export function RadixProviders({
  children,
  dir,
}: {
  children: ReactNode;
  dir: "ltr" | "rtl";
}) {
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}
