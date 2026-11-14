"use client";

import type { CompanyMatch, Entity, RunSummary, SavedProfile } from "@repo/shared";
import { ReactFlowProvider } from "@xyflow/react";
import {
  ArrowLeft,
  List,
  LoaderCircle,
  Network,
  PanelRight,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";
import { idle, lastMatchup, type Run, reduce, settle, streamMatchup } from "@/lib/matchup";
import { useProgress } from "@/lib/store";
import { Board, type Selection } from "./board";
import { domains as brands } from "./brand";
import { DetailPanel } from "./detail-panel";
import { Card, Full } from "./full";
import { InvestorPanel } from "./investor-panel";
import { brief, Incomplete, Investors } from "./investors";
import { Picker } from "./picker";
import { SidePanel } from "./side-panel";
import { SessionLink, TraceList } from "./trace-panel";
import { Wants } from "./wants";

/** Demo company from docs/CONTEXT.md §2, used when onboarding has not picked one. */
const DEMO: Pick<CompanyMatch, "id" | "name" | "website"> = {
  id: "6ebd9536-fcc5-5921-8938-ce3497eb6262",
  name: "In Parallel",
  website: "in-parallel.com",
};

const small = "h-8 px-3.5 text-[13px]";

export function WarmPaths() {
  const { state, ready } = useProgress();
  const params = useSearchParams();
  const asked = params.get("profile");
  const auto = useRef(params.get("run") === "1");
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
  const [view, setView] = useState<"list" | "graph">("list");
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
      if (auto.current) return;
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

  // Fresh from onboarding: start the agent without another click.
  useEffect(() => {
    if (!auto.current || !saved) return;
    auto.current = false;
    window.history.replaceState(null, "", `/warm-paths?profile=${saved.id}`);
    void start();
  }, [saved, start]);

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
  const [sites, setSites] = useState<Record<string, string>>({});
  const domains = useMemo(
    () => brands(run, company, saved?.facts ?? null, sites),
    [run, company, saved, sites],
  );
  // Logos for the answer's companies and investors come from Cala websites, not the agent.
  const wanted = (graph?.entities ?? [])
    .filter((e) => e.role === "company" || e.role === "investor")
    .map((e) => e.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!wanted) return;
    const controller = new AbortController();
    api
      .brands(wanted.split(","), controller.signal)
      .then((next) => setSites((prev) => ({ ...prev, ...next })))
      .catch(() => {});
    return () => controller.abort();
  }, [wanted]);
  const pick =
    selection?.kind === "node" && graph?.investors.some((p) => p.id === selection.id)
      ? selection.id
      : null;

  // Route state is shared by the side panel, its small graph and the main graph.
  const [hovered, setHovered] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new investor starts with no route chosen
  useEffect(() => {
    setHovered(null);
    setPicked(null);
  }, [pick]);
  const routes = useMemo(
    () => (pick ? (brief(run, pick, company.id)?.routes ?? []) : []),
    [run, pick, company.id],
  );
  const active = hovered ?? picked;
  const paths = useMemo(
    () => (graph?.investors ?? []).flatMap((p) => brief(run, p.id, company.id)?.routes ?? []),
    [run, graph, company.id],
  );
  const focus = useMemo(() => (pick ? { routes, active } : null), [pick, routes, active]);
  const investors = (graph?.investors ?? []).flatMap((p) =>
    run.entities[p.id] ? [run.entities[p.id] as Entity] : [],
  );
  const choose = useCallback(
    (id: string | null) => select(id ? { kind: "node", id } : null),
    [select],
  );
  const [full, setFull] = useState(false);
  const [card, setCard] = useState<Selection>(null);
  const closeFull = useCallback(() => {
    setFull(false);
    setCard(null);
  }, []);
  const routeProps = { routes, picked, hover: setHovered, pick: setPicked };

  const aside = (
    <SidePanel
      open={panel}
      wide={Boolean(pick)}
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
      {pick ? (
        <InvestorPanel
          key={pick}
          run={run}
          id={pick}
          company={company}
          prefs={saved?.prefs ?? state.prefs}
          domains={domains}
          select={select}
          active={active}
          picked={picked}
          hover={setHovered}
          pick={setPicked}
        />
      ) : selection ? (
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
          <span className="flex shrink-0 items-center gap-2 text-sm font-medium whitespace-nowrap">
            <Network className="size-4 text-accent" strokeWidth={1.75} />
            Warm paths
          </span>
          {runs.length > 1 && !running && <History runs={runs} shown={shown} open={open} />}

          <div className="ml-auto flex items-center gap-2">
            {run.status !== "idle" && <Toggle view={view} set={setView} />}
            {view === "graph" && graph && !running && (
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

        {!missing && (
          <Wants
            company={{
              name: company.name,
              website: company.website,
              hq: saved?.company.hq ?? state.company?.hq ?? null,
            }}
            stage={saved?.facts?.stage?.value ?? null}
            prefs={saved?.prefs ?? state.prefs}
          />
        )}

        <div className="relative min-h-0 flex-1">
          {view === "list" && run.status !== "idle" ? (
            <Investors
              run={run}
              companyId={company.id}
              domains={domains}
              selected={pick}
              open={(id) => select({ kind: "node", id })}
              graph={() => setView("graph")}
              meta={<Status run={run} />}
            />
          ) : (
            <>
              <ReactFlowProvider>
                <Board
                  run={run}
                  companyId={company.id}
                  explored={explored}
                  selection={selection}
                  select={select}
                  panel={panel}
                  domains={domains}
                  focus={explored ? null : focus}
                  paths={paths}
                  {...(graph && !explored ? { expand: () => setFull(true) } : {})}
                />
              </ReactFlowProvider>
              {run.status !== "idle" && (
                <div className="pointer-events-none absolute top-3 right-4">
                  <Status run={run} />
                </div>
              )}
              {graph && !explored && (
                <Picker
                  run={run}
                  all={paths}
                  companyId={company.id}
                  investors={investors}
                  domains={domains}
                  chosen={pick ? (run.entities[pick] ?? null) : null}
                  choose={choose}
                  {...routeProps}
                />
              )}
              {full && graph && (
                <Full
                  title={
                    <>
                      {company.name} <span className="text-faint">to</span> suggested investors
                    </>
                  }
                  hint="Click anything for details, hover a line to see the link"
                  close={closeFull}
                  back={card ? () => setCard(null) : null}
                >
                  <ReactFlowProvider>
                    <Board
                      run={run}
                      companyId={company.id}
                      explored={false}
                      selection={card}
                      select={setCard}
                      panel={panel}
                      domains={domains}
                      focus={focus}
                      paths={paths}
                      labels
                    />
                  </ReactFlowProvider>
                  <Picker
                    run={run}
                    all={paths}
                    companyId={company.id}
                    actionable
                    investors={investors}
                    domains={domains}
                    chosen={pick ? (run.entities[pick] ?? null) : null}
                    choose={choose}
                    {...routeProps}
                  />
                  {card && (
                    <Card close={() => setCard(null)}>
                      <DetailPanel run={run} selection={card} select={setCard} />
                    </Card>
                  )}
                </Full>
              )}
            </>
          )}

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
/** Short run line: calls made and when it was saved. */
function Status({ run }: { run: Run }) {
  const calls = run.trace.filter((i) => i.kind === "tool").length;
  const count = `${calls} ${calls === 1 ? "call" : "calls"}`;
  const style = "flex items-center gap-1.5 text-[12px] text-faint tabular-nums";

  if (run.status === "running") {
    return (
      <span className={style}>
        <LoaderCircle className="size-3.5 animate-spin text-accent" />
        {count} so far
      </span>
    );
  }
  if (run.status === "idle") return null;
  return (
    <span className={style} title={run.error ?? undefined}>
      {run.status === "incomplete" && <Incomplete />}
      {count}
      {run.savedAt && <>, {when(run.savedAt)}</>}
    </span>
  );
}

/** List or graph view of the results; works while the agent runs. */
function Toggle({ view, set }: { view: "list" | "graph"; set: (view: "list" | "graph") => void }) {
  const options = [
    { id: "list", label: "List", Icon: List },
    { id: "graph", label: "Graph", Icon: Network },
  ] as const;
  return (
    <fieldset className="flex h-8 items-center rounded-full border border-line p-0.5">
      <legend className="sr-only">Results view</legend>
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={view === id}
          onClick={() => set(id)}
          className={`flex h-full items-center gap-1.5 rounded-full px-3 text-[13px] transition ${
            view === id ? "bg-raise text-text" : "text-faint hover:text-text"
          }`}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </fieldset>
  );
}
