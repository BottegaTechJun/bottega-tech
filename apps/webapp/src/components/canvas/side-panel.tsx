"use client";

import { ChevronsRight } from "lucide-react";

interface Props {
  open: boolean;
  close: () => void;
  /** Left side of the header: a title or a back link */
  title: React.ReactNode;
  /** Right side of the header, before the collapse button */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Wider body for content with a canvas */
  wide?: boolean;
}

/** Right panel on the page background beside the main panel; its width slides to zero when closed. */
export function SidePanel({ open, close, title, actions, children, wide = false }: Props) {
  const width = wide ? "w-[440px]" : "w-[380px]";
  return (
    <aside
      aria-hidden={!open}
      inert={!open}
      className={`hidden shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:block ${open ? width : "w-0"}`}
    >
      <div
        className={`flex h-[calc(100dvh-1rem)] ${width} flex-col pl-2 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      >
        <header className="flex h-14 shrink-0 items-center gap-3 pr-1 pl-4">
          <div className="min-w-0 flex-1 text-sm text-dim">{title}</div>
          {actions}
          <button
            type="button"
            onClick={close}
            aria-label="Hide panel"
            className="grid size-8 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-text"
          >
            <ChevronsRight className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto pr-3 pb-6 pl-4">{children}</div>
      </div>
    </aside>
  );
}
