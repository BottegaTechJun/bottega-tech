"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  title: React.ReactNode;
  hint?: string;
  close: () => void;
  /** Esc closes this first when it is set, e.g. a details card */
  back?: (() => void) | null;
  children: React.ReactNode;
}

/** Full screen overlay for a canvas, closed with its button or Esc. */
export function Full({ title, hint, close, back, children }: Props) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (back) back();
      else close();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [close, back]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex animate-rise flex-col bg-ink/95 p-2 backdrop-blur-sm"
    >
      <div className="flex min-h-0 flex-1 flex-col rounded-[20px] border border-line bg-panel">
        <header className="flex h-14 shrink-0 items-center gap-3 px-5">
          <h2 className="truncate text-sm font-medium">{title}</h2>
          {hint && <span className="hidden text-[13px] text-faint sm:inline">{hint}</span>}
          <button
            type="button"
            onClick={close}
            aria-label="Close full screen"
            className="ml-auto grid size-8 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-text"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Closable details card in the top right of a full screen canvas. */
export function Card({ close, children }: { close: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute top-3 right-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[min(380px,calc(100%-1.5rem))] animate-rise flex-col rounded-2xl border border-edge bg-panel shadow-[0_16px_48px_rgb(0_0_0/0.5)]">
      <div className="flex h-10 shrink-0 items-center justify-end px-1.5">
        <button
          type="button"
          onClick={close}
          aria-label="Close details"
          className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-text"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto px-4 pb-4">{children}</div>
    </div>
  );
}
