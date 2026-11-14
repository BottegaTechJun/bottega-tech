"use client";

import { ChevronRight } from "lucide-react";
import { createContext, useContext, useId, useState } from "react";

/*
 * Nested trace list, modelled on reUI's Trace pattern (MIT, Keenthemes) without its
 * shadcn/base-ui dependencies: lines with an icon, a title and a muted description,
 * folded into collapsible groups.
 */

export function Trace({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

interface LineProps {
  status?: "default" | "error" | "active";
  children: React.ReactNode;
}

export function TraceLine({ status = "default", children }: LineProps) {
  const tone = status === "error" ? "text-red-300" : status === "active" ? "text-text" : "text-dim";
  return (
    <div className={`flex min-h-8 min-w-0 items-center gap-2.5 py-1 text-[13px] ${tone}`}>
      {children}
    </div>
  );
}

export function TraceIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-4 shrink-0 place-items-center text-faint [&_svg]:size-3.5">
      {children}
    </span>
  );
}

export function TraceTitle({ children }: { children: React.ReactNode }) {
  return <span className="min-w-0 truncate">{children}</span>;
}

export function TraceDescription({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto shrink-0 pl-3 font-mono text-[11px] text-faint tabular-nums">
      {children}
    </span>
  );
}

const Open = createContext<{ open: boolean; toggle: () => void; id: string } | null>(null);

export function TraceCollapsible(props: {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [inner, setInner] = useState(props.defaultOpen ?? false);
  const open = props.open ?? inner;
  const id = useId();
  const toggle = () => {
    setInner(!open);
    props.onOpenChange?.(!open);
  };
  return (
    <Open.Provider value={{ open, toggle, id }}>
      <div>{props.children}</div>
    </Open.Provider>
  );
}

export function TraceCollapsibleTrigger({ children }: { children: React.ReactNode }) {
  const ctx = useContext(Open);
  return (
    <button
      type="button"
      onClick={ctx?.toggle}
      aria-expanded={ctx?.open}
      aria-controls={ctx?.id}
      className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-1 rounded-lg px-2 text-left transition hover:bg-hover/60"
    >
      <ChevronRight
        className={`size-3.5 shrink-0 text-faint transition-transform ${ctx?.open ? "rotate-90" : ""}`}
      />
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

export function TraceCollapsibleContent({ children }: { children: React.ReactNode }) {
  const ctx = useContext(Open);
  if (!ctx?.open) return null;
  return (
    <div id={ctx.id} className="ml-[7px] border-l border-line pl-4">
      {children}
    </div>
  );
}

/** A trace line that acts on click, styled like a collapsible trigger without the chevron. */
export function TraceAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-2 flex w-[calc(100%+1rem)] items-center rounded-lg px-2 text-left transition hover:bg-hover/60"
    >
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}
