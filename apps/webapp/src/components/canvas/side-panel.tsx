"use client";

import { ChevronsRight, X } from "lucide-react";

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
  /** On mobile, cover the screen instead of hiding */
  sheet?: boolean;
  /** Closes the mobile sheet */
  dismiss?: () => void;
}

/** Right panel beside the main panel on desktop; a full screen sheet on mobile when asked. */
export function SidePanel(props: Props) {
  const { open, close, title, actions, children, wide = false, sheet = false, dismiss } = props;
  const width = wide ? "md:w-[440px]" : "md:w-[380px]";
  const mobile = sheet
    ? "fixed inset-0 z-50 w-screen max-w-[100vw] animate-rise bg-ink md:static md:z-auto md:animate-none md:bg-transparent"
    : "hidden";
  return (
    <aside
      aria-hidden={!open}
      inert={!open}
      className={`${mobile} shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:block ${open ? width : "md:w-0"}`}
    >
      <div
        className={`flex h-[100dvh] w-full flex-col transition-opacity duration-200 md:h-[calc(100dvh-1rem)] md:pl-2 ${wide ? "md:w-[440px]" : "md:w-[380px]"} ${open ? "opacity-100" : "opacity-0"}`}
      >
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line pr-2 pl-4 md:border-0 md:pr-1">
          <div className="min-w-0 flex-1 text-sm text-dim">{title}</div>
          {actions}
          <button
            type="button"
            onClick={dismiss ?? close}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-text md:hidden"
          >
            <X className="size-4" />
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Hide panel"
            className="hidden size-8 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-text md:grid"
          >
            <ChevronsRight className="size-4" />
          </button>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-3 pb-6 md:pt-0 md:pr-3">
          {children}
        </div>
      </div>
    </aside>
  );
}
