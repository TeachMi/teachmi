"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Modal, ModalClose, ModalContent, ModalTitle } from "@/components/ui/modal";

/**
 * Client shell for the intercepted `/signup` route. The modal is always open
 * while this component is mounted (it only mounts when the `@modal` slot
 * matched a soft navigation to `/signup`); dismissing it pops the URL back to
 * the originating page via `router.back()`.
 */
export function SignupModal({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <ModalContent size="lg" className="max-h-[90vh] overflow-y-auto">
        {/* Radix Dialog requires a title for a11y; the form supplies its own
            visible heading, so this one is screen-reader-only. */}
        <ModalTitle className="sr-only">הרשמה ל-TeachMe</ModalTitle>
        <ModalClose
          aria-label="סגירה"
          className="absolute start-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fixed-dim"
        >
          <span aria-hidden="true" className="material-symbols-outlined">
            close
          </span>
        </ModalClose>
        {children}
      </ModalContent>
    </Modal>
  );
}
