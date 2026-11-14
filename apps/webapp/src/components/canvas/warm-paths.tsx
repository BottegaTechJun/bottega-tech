"use client";

import type { CompanyMatch } from "@repo/shared";
import { ReactFlowProvider } from "@xyflow/react";
import {
  ArrowLeft,
  CircleAlert,
  LoaderCircle,
  Network,
  PanelRight,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { Shell } from "@/components/shell";
import { idle, lastMatchup, type Run, reduce, settle, streamMatchup } from "@/lib/matchup";
import { useProgress } from "@/lib/store";
import { Board, type Selection } from "./board";
import { DetailPanel } from "./detail-panel";
import { SidePanel } from "./side-panel";
import { roleColor, roleLabel } from "./style";
import { SessionLink, TraceList } from "./trace-panel";

/** Demo company from docs/CONTEXT.md §2, used when onboarding has not picked one. */
const DEMO: Pick<CompanyMatch, "id" | "name" | "website"> = {
  id: "6ebd9536-fcc5-5921-8938-ce3497eb6262",
  name: "In Parallel",
  website: "in-parallel.com",
};

const small = "h-8 px-3.5 text-[13px]";

export function WarmPaths() {
  const { state, ready } = useProgress();
  const company = state.company ?? DEMO;
  const manualCompany = state.manualCompany;
  const [run, dispatch] = useReducer(
    (current: Run, action: Parameters<typeof reduce>[1] | { type: "settle" }) =>
      action.type === "settle" ? settle(current) : reduce(current, action),
    idle,
  );
  const [selection, setSelection] = useState<Selection>(null);
  const [explored, setExplored] = useState(false);
  const [panel, setPanel] = useState(true);
  const abort = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const sessionId = `warmup-${crypto.randomUUID()}`;
    setSelection(null);
    setExplored(false);
    setPanel(true);
    dispatch({ type: "begin", sessionId });
    try {
      await streamMatchup(
        {
          companyId: company.id,
          name: company.name,
          sessionId,
          ...(manualCompany ? { manualCompany } : {}),
        },
        (event) => dispatch({ type: "event", event }),
        controller.signal,
      );
      dispatch({ type: "settle" });
    } catch (err) {
      const stopped = controller.signal.aborted;
      dispatch({
        type: "fail",
        message: stopped
          ? "Stopped. Results so far are kept."
          : err instanceof Error
            ? err.message
            : "Lookup failed",
      });
    }
  }, [company.id, company.name, manualCompany]);

  useEffect(() => () => abort.current?.abort(), []);

  // Show the last saved run straight away; the agent only runs when asked.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    lastMatchup(company.id).then((saved) => {
      if (live && saved) dispatch({ type: "replay", saved });
    });
    return () => {
      live = false;
    };
  }, [ready, company.id]);

  const select = useCallback((next: Selection) => {
    setSelection(next);
    if (next) setPanel(true);
  }, []);

  const running = run.status === "running";
  const graph = run.graph;

  const aside = (
    <SidePanel
      open={panel}
      close={() => setPanel(false)}
      title={
        selection ? (
          <button
            type="button"
            onClick={() => setSelection(null)}
            className="group flex items-center gap-1 transition hover:text-text"
          >
            <ArrowLeft className="size-4 transition group-hover:-translate-x-0.5" />
            Agent trace
          </button>
        ) : (
          "Agent trace"
        )
      }
      actions={!selection && run.sessionId ? <SessionLink run={run} /> : null}
    >
      {selection ? (
        <DetailPanel run={run} selection={selection} select={select} />
      ) : (
        <>
          {graph && (
            <div className="mb-6 animate-rise">
              <p className="text-sm leading-relaxed">{graph.summary}</p>
              {graph.dropped > 0 && (
                <p className="mt-2 text-xs text-faint">
                  {graph.dropped} claim{graph.dropped === 1 ? "" : "s"} without a source{" "}
                  {graph.dropped === 1 ? "was" : "were"} left out.
                </p>
              )}
            </div>
          )}
          <TraceList run={run} />
        </>
      )}
    </SidePanel>
  );

  return (
    <Shell active="paths" aside={aside}>
      <div className="flex h-[100dvh] flex-col md:h-[calc(100dvh-1rem)]">
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Network className="size-4 text-accent" strokeWidth={1.75} />
            Warm paths
          </span>
          <span className="flex h-8 items-center gap-2 rounded-lg border border-line px-2.5 text-[13px] text-dim">
            <Logo name={company.name} website={company.website} size="xs" />
            {company.name}
          </span>
          <Status run={run} />

          <div className="ml-auto flex items-center gap-2">
            {graph && !running && (
              <button
                type="button"
                className={`btn-ghost ${small}`}
                onClick={() => setExplored((v) => !v)}
              >
                {explored ? "Show answer" : "Show everything explored"}
              </button>
            )}
            {running ? (
              <button
                type="button"
                className={`btn-ghost ${small}`}
                onClick={() => abort.current?.abort()}
              >
                <Square className="size-3" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                className={`btn-primary ${small}`}
                onClick={start}
                disabled={!ready}
              >
                {run.status === "idle" ? (
                  <Play className="size-3.5" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                {run.status === "idle" ? "Find investors" : "Run again"}
              </button>
            )}
            {!panel && (
              <button
                type="button"
                onClick={() => setPanel(true)}
                aria-label="Show agent trace"
                className="hidden size-8 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-text md:grid"
              >
                <PanelRight className="size-4" />
              </button>
            )}
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <ReactFlowProvider>
            <Board
              run={run}
              companyId={company.id}
              explored={explored}
              selection={selection}
              select={select}
              panel={panel}
            />
          </ReactFlowProvider>

          {run.status === "idle" && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
              <p className="max-w-xs text-center text-sm leading-relaxed text-dim">
                The agent starts at {company.name}, follows its investors into the rounds they
                joined, and finds who led them. Every line here comes from a sourced company record.
              </p>
            </div>
          )}

          <Legend />
        </div>
      </div>
    </Shell>
  );
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** One short line about the run, next to the company. */
function Status({ run }: { run: Run }) {
  const calls = run.trace.filter((i) => i.kind === "tool").length;
  const picks = run.graph?.investors.length ?? 0;
  const style = "ml-2 hidden items-center gap-1.5 truncate text-[13px] text-faint lg:flex";

  if (run.status === "running") {
    return (
      <span className={style}>
        <LoaderCircle className="size-3.5 animate-spin text-accent" />
        Tracing your network, {calls} {calls === 1 ? "step" : "steps"} so far
      </span>
    );
  }
  if (run.status === "incomplete") {
    return (
      <span className={style} title={run.error ?? undefined}>
        <CircleAlert className="size-3.5 text-amber-300" />
        Stopped early. Showing what it found.
      </span>
    );
  }
  if (run.status === "done") {
    return (
      <span className={style}>
        {picks} suggested {picks === 1 ? "lead" : "leads"} from {calls} research steps
        {run.savedAt && <>, saved {when(run.savedAt)}</>}
      </span>
    );
  }
  return null;
}

function Legend() {
  const roles = ["company", "investor", "round", "person", "event"] as const;
  return (
    <ul className="pointer-events-none absolute right-4 bottom-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-faint">
      {roles.map((role) => (
        <li key={role} className="flex items-center gap-1.5">
          <span className="size-2 rounded-[3px]" style={{ background: roleColor[role] }} />
          {roleLabel[role]}
        </li>
      ))}
    </ul>
  );
}
