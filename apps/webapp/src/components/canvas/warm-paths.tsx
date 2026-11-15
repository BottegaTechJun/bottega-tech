"use client";

import type {
  Entity,
  MatchupEvent,
  SearchSession,
  SearchSessionInput,
  SearchSessionSummary,
} from "@repo/shared";
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
import { signIn, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Shell } from "@/components/shell";
import { announce, api } from "@/lib/api";
import { local, toSession } from "@/lib/local";
import { idle, type Run, reduce, settle, streamMatchup } from "@/lib/matchup";
import { useProgress } from "@/lib/store";
import { suggestions } from "@/lib/suggest";
import { Ask, Asked } from "./ask";
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

const small = "h-8 px-3.5 text-[13px]";

/** Keep refreshes on the saved session without retriggering the App Router loader. */
function rememberSession(id: string): void {
  const search = new URLSearchParams(window.location.search);
  search.delete("run");
  search.delete("fresh");
  search.set("session", id);
  window.history.replaceState(window.history.state, "", `/warm-paths?${search.toString()}`);
}

export function WarmPaths() {
  const { data: authSession, status: authStatus } = useSession();
  const { state, ready } = useProgress();
  const params = useSearchParams();
  const asked = params.get("session");
  const fresh = params.get("fresh") === "1";
  const auto = useRef(params.get("run") === "1");
  const sessionId = ready && !fresh ? asked : null;
  const [context, setContext] = useState<SearchSessionInput | null>(null);
  const [missing, setMissing] = useState(false);
  const [runs, setRuns] = useState<SearchSessionSummary[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  const company = context?.company ?? state.company;
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
  // Mobile has no side panel; the trace opens as a full screen sheet instead.
  const [sheet, setSheet] = useState(false);
  const [view, setView] = useState<"list" | "graph">("list");
  const abort = useRef<AbortController | null>(null);
  const userId = authSession?.user?.id ?? null;
  // Runs change whenever a search is kept locally, so this rechecks then too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs is the refresh signal
  const localOnly = useMemo(
    () => Boolean(userId && shown && local.ids(userId).includes(shown)),
    [userId, shown, runs],
  );

  /** A saved search from the API, or from this browser when the API did not keep it. */
  const find = useCallback(
    async (id: string): Promise<SearchSession | null> => {
      const saved = await api.search(id).catch(() => null);
      return saved ?? (userId ? local.get(userId, id) : null);
    },
    [userId],
  );

  /** Runs the agent; with a question, as a follow-up on the run on screen. */
  const start = useCallback(
    async (question?: string) => {
      if (!company) return;
      if (authStatus !== "authenticated" || !authSession?.user) {
        void signIn("google");
        return;
      }
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const sessionId = crypto.randomUUID();
      if (question && localOnly) return;
      const followUp = question && shown ? { question, parent: shown } : null;
      setSelection(null);
      setExplored(false);
      setPanel(true);
      // The live run has no saved id until it ends.
      setShown(null);
      dispatch({
        type: "begin",
        sessionId,
        ...(followUp?.parent
          ? { followUp: { question: followUp.question, parent: followUp.parent } }
          : {}),
      });
      const userId = authSession.user.id;
      const events: MatchupEvent[] = [];
      let input: SearchSessionInput | null = null;
      try {
        const facts = context?.facts ?? (await api.profile(company.id).catch(() => null));
        input = { company, facts, prefs: context?.prefs ?? state.prefs };
        setContext(input);
        await streamMatchup(
          {
            companyId: company.id,
            name: company.name,
            sessionId,
            profile: input,
            ...(followUp ? { followUp } : {}),
          },
          (event) => {
            events.push(event);
            dispatch({ type: "event", event });
          },
          controller.signal,
        );
        dispatch({ type: "settle" });
      } catch (err) {
        const stopped = controller.signal.aborted;
        const text = stopped
          ? "Stopped. Results so far are kept."
          : err instanceof Error
            ? err.message
            : "Lookup failed";
        events.push({ type: "error", message: text });
        dispatch({ type: "fail", message: text });
      }
      const next = await api.searches().catch(() => null);
      // Another run or a history pick may have taken over while this one was saving.
      if (abort.current !== controller) return;
      let saved = next?.some((r) => r.id === sessionId) ?? false;
      // The API did not save it: keep it in this browser so it is not lost.
      if (!saved && input && events.some((e) => e.type !== "start")) {
        saved = local.keep(userId, toSession(sessionId, input, events, followUp?.parent ?? null));
      }
      setRuns(local.merge(userId, next ?? []));
      if (saved) {
        setShown(sessionId);
        rememberSession(sessionId);
        announce();
      }
    },
    [authSession?.user, authStatus, company, context, shown, localOnly, state.prefs],
  );

  useEffect(() => () => abort.current?.abort(), []);

  // A search session opens on its saved replay; the agent only runs when asked.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    abort.current?.abort();
    dispatch({ type: "reset" });
    setContext(null);
    setMissing(false);
    setRuns([]);
    setShown(null);
    if (!sessionId) {
      return () => {
        live = false;
      };
    }
    (async () => {
      const session = await find(sessionId);
      if (!live) return;
      if (!session) {
        setMissing(true);
        return;
      }
      setContext(session.input);
      setShown(session.id);
      const list = await api.searches().catch(() => []);
      if (!live) return;
      setRuns(userId ? local.merge(userId, list) : list);
      dispatch({ type: "replay", saved: session.replay });
    })();
    return () => {
      live = false;
    };
  }, [ready, sessionId, find, userId]);

  // Fresh from onboarding: start the agent without another click.
  useEffect(() => {
    if (!auto.current || !ready || sessionId || !company) return;
    auto.current = false;
    void start();
  }, [ready, sessionId, company, start]);

  /** Shows a saved run. A run that can't be loaded leaves the screen as it is. */
  const open = useCallback(
    async (runId: string) => {
      const session = await find(runId);
      if (!session) return;
      abort.current?.abort();
      abort.current = null;
      rememberSession(runId);
      setShown(runId);
      setContext(session.input);
      setSelection(null);
      setExplored(false);
      dispatch({ type: "replay", saved: session.replay });
    },
    [find],
  );

  const select = useCallback((next: Selection) => {
    setSelection(next);
    if (next) setPanel(true);
  }, []);

  const running = run.status === "running";
  const graph = run.graph;
  const revised = run.followUp;
  // Every question asked on the way to this answer: its own, then its parents'.
  const questions = useMemo(() => {
    const byId = new Map(runs.map((r) => [r.id, r]));
    const out = revised ? [revised.question] : [];
    let parent = revised ? byId.get(revised.parent) : undefined;
    while (parent?.question && out.length < 20) {
      out.push(parent.question);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return out;
  }, [runs, revised]);
  // Chips are checked against this answer's data, so they change with every run.
  const prefs = context?.prefs ?? state.prefs;
  const chips = useMemo(
    () => (prefs ? suggestions(prefs, run, { asked: questions }) : []),
    [prefs, run, questions],
  );
  const [sites, setSites] = useState<Record<string, string>>({});
  const domains = useMemo(
    () => (company ? brands(run, company, context?.facts ?? null, sites) : {}),
    [run, company, context, sites],
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
    () => (pick && company ? (brief(run, pick, company.id)?.routes ?? []) : []),
    [run, pick, company],
  );
  const active = hovered ?? picked;
  const paths = useMemo(
    () =>
      company
        ? (graph?.investors ?? []).flatMap((p) => brief(run, p.id, company.id)?.routes ?? [])
        : [],
    [run, graph, company],
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

  if (!company) {
    return (
      <Shell active="paths">
        <div className="grid min-h-[100dvh] place-items-center px-6">
          <div className="max-w-sm text-center">
            <h1 className="text-lg font-semibold tracking-tight">Choose a company first</h1>
            <p className="mt-2 text-sm leading-relaxed text-dim">
              Start from Home to select your company and shape the investor search.
            </p>
            <a href="/" className="btn-primary mt-5 h-9 px-4 text-[13px]">
              Go to Home
            </a>
          </div>
        </div>
      </Shell>
    );
  }

  const aside = (
    <SidePanel
      open={panel}
      wide={Boolean(pick)}
      close={() => setPanel(false)}
      sheet={sheet || Boolean(selection)}
      dismiss={() => {
        setSelection(null);
        setSheet(false);
      }}
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
          prefs={context?.prefs ?? state.prefs}
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
    <Shell active="paths" profile={shown} aside={aside}>
      <div className="flex h-[100dvh] min-w-0 flex-col overflow-x-clip md:h-[calc(100dvh-1rem)]">
        <header className="flex h-14 min-w-0 shrink-0 items-center gap-2 px-4">
          <span className="hidden shrink-0 items-center gap-2 text-sm font-medium whitespace-nowrap sm:flex">
            <Network className="size-4 text-accent" strokeWidth={1.75} />
            Leads
          </span>
          {runs.length > 1 && !running && <History runs={runs} shown={shown} open={open} />}

          <div className="ml-auto flex shrink-0 items-center gap-2">
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
                onClick={() => start()}
                disabled={!ready || !company}
              >
                {run.status === "idle" ? (
                  <Play className="size-3.5" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                {run.status === "idle" ? "Find investors" : "Run again"}
              </button>
            )}
            {run.status !== "idle" && (
              <button
                type="button"
                onClick={() => {
                  setPanel(true);
                  setSheet(true);
                }}
                aria-label="Show agent trace"
                className="grid size-8 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-text md:hidden"
              >
                <PanelRight className="size-4" />
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
              hq: context?.company.hq ?? state.company?.hq ?? null,
            }}
            stage={context?.facts?.stage?.value ?? null}
            prefs={context?.prefs ?? state.prefs}
          />
        )}

        {revised && !missing && (
          <Asked question={revised.question} back={() => void open(revised.parent)} />
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
              panel={panel}
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

        {context && run.status !== "idle" && (
          <Ask
            chips={chips}
            status={run.status}
            local={localOnly}
            ask={(question) => void start(question)}
          />
        )}
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

const short = (text: string, max = 36) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** "14 Nov, 18:20 · ↳ Only Nordic funds · 3 investors" */
function runLabel(run: SearchSessionSummary): string {
  const result =
    run.status === "complete"
      ? `${run.picks} ${run.picks === 1 ? "investor" : "investors"}`
      : run.status === "running"
        ? "in progress"
        : "partial result";
  return [when(run.savedAt), run.question && `↳ ${short(run.question)}`, result]
    .filter(Boolean)
    .join(" · ");
}

/** Picker for a profile's older runs, newest first. Follow-ups show their question. */
function History({
  runs,
  shown,
  open,
}: {
  runs: SearchSessionSummary[];
  shown: string | null;
  open: (id: string) => void;
}) {
  return (
    <select
      aria-label="Run history"
      value={shown ?? ""}
      onChange={(e) => open(e.target.value)}
      className="h-8 min-w-0 flex-1 rounded-lg sm:ml-1 sm:max-w-60 sm:flex-none border border-line bg-panel px-2 text-[13px] text-dim outline-none transition hover:border-edge"
    >
      {shown === null && <option value="">Live run</option>}
      {runs.map((r) => (
        <option key={r.id} value={r.id}>
          {runLabel(r)}
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
          aria-label={label}
          onClick={() => set(id)}
          className={`flex h-full items-center gap-1.5 rounded-full px-3 text-[13px] transition ${
            view === id ? "bg-raise text-text" : "text-faint hover:text-text"
          }`}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </fieldset>
  );
}
