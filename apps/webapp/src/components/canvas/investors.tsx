"use client";

import type { Connection, Entity } from "@repo/shared";
import { ChevronRight, CircleAlert, FileText, Network, Route } from "lucide-react";
import type { Run } from "@/lib/matchup";
import { type Route as Path, routes } from "./graph";
import { Mark } from "./mark";

export interface Brief {
  entity: Entity;
  rank: number;
  why: string;
  /** Connections that start or end at this investor */
  own: Connection[];
  /** Every route from the company to this investor */
  routes: Path[];
  /** Every connection on those routes */
  paths: Connection[];
  /** Entities between the investor and the company */
  bridges: Entity[];
  type: string;
  sources: number;
}

/** What the list and the side panel know about one suggested investor. */
export function brief(run: Run, id: string, companyId: string): Brief | null {
  const graph = run.graph;
  const entity = run.entities[id];
  const index = graph?.investors.findIndex((p) => p.id === id) ?? -1;
  const pick = graph?.investors[index];
  if (!graph || !entity || !pick) return null;
  const found = routes(graph, id, companyId, run.entities);
  const paths = [...new Map(found.flatMap((r) => r.hops.map((h) => [h.c.id, h.c]))).values()];
  const own = graph.connections.filter((c) => c.from === id || c.to === id);
  // Rounds go last; the firms, people and events say more at a glance.
  const bridges = [...new Set(found.flatMap((r) => r.nodes))]
    .filter((m) => m !== id && m !== companyId)
    .flatMap((m) => (run.entities[m] ? [run.entities[m]] : []))
    .sort((a, b) => Number(a.role === "round") - Number(b.role === "round"));
  const led =
    own.some((c) => c.kind === "led") ||
    own.some((c) => c.facts.some((f) => f.from === id && f.lead));
  const cites = new Set(paths.flatMap((c) => c.evidence.map((e) => e.url ?? e.name)));
  return {
    entity,
    rank: index + 1,
    why: pick.why,
    own,
    routes: found,
    paths,
    bridges,
    type: led ? "Lead investor" : "Investor",
    sources: cites.size,
  };
}

interface Props {
  run: Run;
  companyId: string;
  domains: Record<string, string>;
  selected: string | null;
  open: (id: string) => void;
  /** Switches to the graph view */
  graph: () => void;
  /** Short run line, right of the heading */
  meta: React.ReactNode;
}

/** Default results view: the suggested investors as a short ranked list. */
export function Investors(props: Props) {
  const { run, companyId, domains, selected, open, graph, meta } = props;
  const rows = (run.graph?.investors ?? []).flatMap((p) => {
    const b = brief(run, p.id, companyId);
    return b ? [b] : [];
  });
  const running = run.status === "running";

  if (!rows.length && !running) {
    if (run.status !== "incomplete") return null;
    return (
      <div className="grid h-full place-items-center px-6">
        <div className="max-w-xs text-center">
          <p className="text-sm text-dim">The run stopped before the agent picked investors.</p>
          <button type="button" onClick={graph} className="btn-ghost mt-4 h-8 px-3.5 text-[13px]">
            <Network className="size-3.5" />
            See what it explored
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 pt-4 pb-10 md:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex h-9 items-center gap-2 text-[13px]">
          <span className="font-medium">Suggested investors</span>
          {rows.length > 0 && (
            <span className="font-mono text-faint tabular-nums">{rows.length}</span>
          )}
          <span className="ml-auto">{meta}</span>
        </div>

        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
          {rows.map((row, i) => (
            <li
              key={row.entity.id}
              className="animate-rise"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <Row row={row} domains={domains} active={selected === row.entity.id} open={open} />
            </li>
          ))}
          {running && rows.length === 0 && [0, 1, 2, 3].map((n) => <Skeleton key={n} n={n} />)}
        </ul>
      </div>
    </div>
  );
}

export function Incomplete() {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 text-[11px] text-amber-200">
      <CircleAlert className="size-3" />
      Incomplete
    </span>
  );
}

function Row(props: {
  row: Brief;
  domains: Record<string, string>;
  active: boolean;
  open: (id: string) => void;
}) {
  const { row, domains, active, open } = props;
  const line = row.own[0]?.label ?? row.why;
  const links = row.bridges.filter((b) => b.role !== "round");
  return (
    <button
      type="button"
      onClick={() => open(row.entity.id)}
      aria-pressed={active}
      className={`group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3.5 text-left transition ${
        active ? "bg-raise" : "hover:bg-raise/60"
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="w-5 font-mono text-[11px] text-faint tabular-nums">
          {String(row.rank).padStart(2, "0")}
        </span>
        <Mark entity={row.entity} domain={domains[row.entity.id]} size={40} />
      </span>

      <span className="min-w-0">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[15px] font-medium tracking-tight">{row.entity.name}</span>
          <span className="shrink-0 text-[12px] text-faint">{row.type}</span>
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-dim">{line}</span>
      </span>

      <span className="flex items-center gap-4">
        {links.length > 0 && (
          <span
            className="hidden items-center sm:flex"
            title={`Through ${links.map((b) => b.name).join(", ")}`}
          >
            {links.slice(0, 3).map((b) => (
              <Mark
                key={b.id}
                entity={b}
                domain={domains[b.id]}
                size={22}
                className="-ml-1.5 ring-2 ring-panel first:ml-0"
              />
            ))}
            {links.length > 3 && (
              <span className="ml-1.5 font-mono text-[11px] text-faint">+{links.length - 3}</span>
            )}
          </span>
        )}
        <span
          className="hidden items-center gap-1 font-mono text-[11px] text-faint tabular-nums md:flex"
          title={`${row.routes.length} ${row.routes.length === 1 ? "path" : "paths"} from you`}
        >
          <Route className="size-3.5" strokeWidth={1.75} />
          {row.routes.length}
        </span>
        <span
          className="hidden items-center gap-1 font-mono text-[11px] text-faint tabular-nums md:flex"
          title={`${row.sources} ${row.sources === 1 ? "source" : "sources"}`}
        >
          <FileText className="size-3.5" strokeWidth={1.75} />
          {row.sources}
        </span>
        <ChevronRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-text" />
      </span>
    </button>
  );
}

function Skeleton({ n }: { n: number }) {
  return (
    <li
      className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3.5"
      style={{ opacity: 1 - n * 0.2 }}
    >
      <span className="flex items-center gap-3">
        <span className="skeleton h-3 w-5" />
        <span className="skeleton size-10 rounded-full!" />
      </span>
      <span className="flex flex-col gap-2">
        <span className="skeleton h-3.5 w-40" />
        <span className="skeleton h-3 w-72 max-w-full" />
      </span>
      <span className="flex items-center gap-4">
        <span className="skeleton hidden h-5 w-14 rounded-full! sm:block" />
        <span className="skeleton h-3 w-6" />
      </span>
    </li>
  );
}
