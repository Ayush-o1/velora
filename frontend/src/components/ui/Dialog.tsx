"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Built on the native <dialog> element deliberately: it gives us focus
 * trapping, Escape-to-close, and a real modal stacking context for free,
 * without pulling in a dependency for something the platform already
 * does correctly.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className="m-auto rounded-[var(--radius-lg)] border border-border bg-surface p-0 text-ink shadow-[0_24px_64px_-24px_rgba(33,31,26,0.35)] backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] open:animate-fade-up"
    >
      <div className="w-[min(420px,90vw)] p-6">
        <h2 id="dialog-title" className="font-display text-lg text-ink">
          {title}
        </h2>
        <div className="mt-3 text-sm text-ink-secondary">{children}</div>
      </div>
    </dialog>
  );
}
