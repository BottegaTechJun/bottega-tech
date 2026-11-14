"use client";

import type { CompanyMatch, RunSummary, SavedProfile } from "@repo/shared";
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
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
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
  const asked = useSearchParams().get("profile");
  const profileId = ready ? (asked ?? state.profileId) : null;
  const [saved, setSaved] = useState<SavedProfile | null>(null);
  const [missing, setMissing] = useState(false);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  const company = saved?.company ?? (profileId ? null : state.company) ?? DEMO;
  // Without a profile the canvas follows the onboarding company.
  const legacy = profileId ? null : company.id;
  const [run, dispatch] = useReducer(
    (
      current: Run,
      action: Parameters<typeof reduce>[1] | { type: "settle" } | { type: "reset" },
    ) =>
      action.type === "reset"
        ? idle
        : action.type === "settle"
          ? settle(current)
          : reduce(current, action),
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
          ...(saved ? { profileId: saved.id } : {}),
        },
        (event) => dispatch({ type: "event", event }),
        controller.signal,
      );
      dispatch({ type: "settle" });
      if (saved) {
        const next = await api.runs(saved.id).catch(() => null);
        if (next) {
          setRuns(next);
          setShown(next[0]?.id ?? null);
        }
      }
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
  }, [company.id, company.name, saved]);

  useEffect(() => () => abort.current?.abort(), []);

  // A profile opens on its latest finished run; the agent only runs when asked.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    abort.current?.abort();
    dispatch({ type: "reset" });
    setSaved(null);
    setMissing(false);
    setRuns([]);
    setShown(null);
    if (!profileId) {
      if (!legacy) return;
      lastMatchup(legacy).then((last) => {
        if (live && last) dispatch({ type: "replay", saved: last });
      });
      return () => {
        live = false;
      };
    }
    (async () => {
      const profile = await api.saved(profileId).catch(() => null);
      if (!live) return;
      if (!profile) {
        setMissing(true);
        return;
      }
      setSaved(profile);
      const list = await api.runs(profile.id).catch(() => []);
      if (!live) return;
      setRuns(list);
      const pick = list.find((r) => r.complete) ?? list[0];
      if (!pick) return;
      setShown(pick.id);
      const replay = await api.run(profile.id, pick.id).catch(() => null);
      if (live && replay) dispatch({ type: "replay", saved: replay });
    })();
    return () => {
      live = false;
    };
  }, [ready, profileId, legacy]);

  const open = useCallback(
    async (runId: string) => {
      if (!saved) return;
      abort.current?.abort();
      setShown(runId);
      setSelection(null);
      setExplored(false);
      const replay = await api.run(saved.id, runId).catch(() => null);
      if (replay) dispatch({ type: "replay", saved: replay });
    },
    [saved],
  );

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
                  {graph.dropped} claim{graph.dropped === 1 ? "" : "s"} without a Cala source{" "}
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
    <Shell active="paths" profile={saved?.id ?? null} aside={aside}>
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
          {runs.length > 1 && !running && <History runs={runs} shown={shown} open={open} />}

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
                disabled={!ready || (Boolean(profileId) && !saved)}
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

          {missing && (
            <div className="absolute inset-0 grid place-items-center px-6">
              <p className="max-w-xs text-center text-sm text-dim">
                This profile no longer exists. Pick another one in the sidebar.
              </p>
            </div>
          )}

          {run.status === "idle" && !missing && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
              <p className="max-w-xs text-center text-sm leading-relaxed text-dim">
                The agent starts at {company.name}, follows its investors into the rounds they
                joined, and finds who led them. Every line here comes from a sourced Cala record.
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

/** Picker for a profile's older runs, newest first. */
function History({
  runs,
  shown,
  open,
}: {
  runs: RunSummary[];
  shown: string | null;
  open: (id: string) => void;
}) {
  return (
    <select
      aria-label="Run history"
      value={shown ?? ""}
      onChange={(e) => open(e.target.value)}
      className="ml-1 h-8 max-w-48 rounded-lg border border-line bg-panel px-2 text-[13px] text-dim outline-none transition hover:border-edge"
    >
      {shown === null && <option value="">Live run</option>}
      {runs.map((r) => (
        <option key={r.id} value={r.id}>
          {when(r.savedAt)}
          {r.complete ? ` · ${r.picks} leads` : " · partial"}
        </option>
      ))}
    </select>
  );
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
        Exploring Cala, {calls} {calls === 1 ? "call" : "calls"} so far
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
        {picks} suggested {picks === 1 ? "lead" : "leads"} from {calls} Cala calls
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
