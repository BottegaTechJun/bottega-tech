"use client";

import type { Fact } from "@repo/shared";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Route as Glyph } from "lucide-react";
import { useEffect, useState } from "react";
import type { Run } from "@/lib/matchup";
import type { Hop, Route } from "./graph";
import { Mark } from "./mark";
import { kindLabel, relationText, roleLabel } from "./style";

interface Props {
  routes: Route[];
  /** Index of the pinned route */
  picked: number | null;
  hover: (index: number | null) => void;
  pick: (index: number | null) => void;
  run: Run;
  domains: Record<string, string>;
  /** How the full path opens: in place of the list, or inline below its row */
  side?: "right" | "below";
}

/** One row per route; hover previews it on the graph, click pins it, the arrow opens the full path. */
export function RouteList(props: Props) {
  const { routes, picked, hover, pick, run, domains, side = "right" } = props;
  const [open, setOpen] = useState<number | null>(null);
  // Another investor's routes start back at the list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the route set changes
  useEffect(() => setOpen(null), [routes]);

  if (!routes.length) {
    return <p className="text-[13px] text-faint">No path from your company in this run.</p>;
  }
  // A single route needs no list: show its full chain right away.
  const only = routes.length === 1 ? routes[0] : undefined;
  if (only) return <Single key={only.id} route={only} run={run} domains={domains} />;
  const Arrow = side === "right" ? ChevronRight : ChevronDown;
  const route = open === null ? undefined : routes[open];
  // On a canvas the chain replaces the list in the same card, so nothing covers the graph.
  if (side === "right" && route && open !== null) {
    return (
      <div className="animate-rise">
        <button
          type="button"
          onClick={() => {
            setOpen(null);
            pick(null);
          }}
          className="flex h-8 w-full items-center gap-1.5 rounded-lg px-1.5 text-[12px] text-faint transition hover:bg-raise/60 hover:text-text"
        >
          <ChevronLeft className="size-3.5" />
          All {routes.length} paths
        </button>
        <div className="mt-1 flex items-start gap-2.5 px-2 text-[13px]">
          <Glyph
            className="mt-0.5 size-3.5 shrink-0"
            strokeWidth={2}
            style={{ color: route.color }}
          />
          <span className="leading-snug font-medium">{route.label}</span>
          <span className="ml-auto shrink-0 pl-3 font-mono text-[11px] text-faint">
            {kindLabel[route.kind]}
          </span>
        </div>
        <div className="px-2 pb-1">
          <Chain route={route} run={run} domains={domains} />
        </div>
      </div>
    );
  }
  return (
    <ul className="flex flex-col" onMouseLeave={() => hover(null)}>
      {routes.map((r, i) => (
        <li
          key={r.id}
          className={`group rounded-lg transition ${
            picked === i || open === i ? "bg-raise" : "hover:bg-raise/60"
          }`}
        >
          <div className="flex items-center">
            <button
              type="button"
              aria-pressed={picked === i}
              onMouseEnter={() => hover(i)}
              onFocus={() => hover(i)}
              onBlur={() => hover(null)}
              onClick={() => pick(picked === i ? null : i)}
              className={`flex min-h-9 min-w-0 flex-1 items-center gap-2.5 pl-2 text-left text-[13px] transition ${
                picked === i || open === i ? "text-text" : "text-dim group-hover:text-text"
              }`}
            >
              <Glyph className="size-3.5 shrink-0" strokeWidth={2} style={{ color: r.color }} />
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="ml-auto shrink-0 pl-3 font-mono text-[11px] text-faint">
                {kindLabel[r.kind]}
              </span>
            </button>
            <button
              type="button"
              aria-label="Show full path"
              aria-expanded={open === i}
              onClick={() => {
                setOpen(open === i ? null : i);
                pick(i);
              }}
              className={`mx-1 grid size-7 shrink-0 place-items-center rounded-md transition hover:bg-hover hover:text-text ${
                open === i ? "bg-hover text-text" : "text-faint"
              }`}
            >
              <Arrow
                className={`size-3.5 transition ${side === "below" && open === i ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          {side === "below" && open === i && (
            <div className="animate-rise px-2 pb-1 [&>ol]:mt-1">
              <Chain route={r} run={run} domains={domains} />
              <Fold close={() => setOpen(null)} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

const FORWARD: Record<string, [string, string]> = {
  raised: ["raised", "raised by"],
  led: ["led", "led by"],
  joined: ["joined", "joined by"],
  listed: ["listed at", "lists"],
  ceo: ["CEO of", "has CEO"],
};

/** The Cala relation behind one hop, read in path order, e.g. "raised" or "joined by". */
function verb(hop: Hop, run: Run): string {
  const same = (f: Fact) =>
    (f.from === hop.from && f.to === hop.to) || (f.from === hop.to && f.to === hop.from);
  const fact = hop.c.facts.find(same) ?? Object.values(run.facts).find(same);
  if (!fact) return hop.c.label;
  const back = fact.from !== hop.from;
  const key =
    fact.relation === "PARTICIPATES_IN_FUNDING_ROUND"
      ? fact.role === "ISSUER"
        ? "raised"
        : fact.lead
          ? "led"
          : "joined"
      : fact.relation === "PARTICIPATES_IN_EVENT"
        ? "listed"
        : fact.relation === "IS_CEO_OF"
          ? "ceo"
          : null;
  const pair = key ? FORWARD[key] : undefined;
  if (pair) return back ? pair[1] : pair[0];
  const text = relationText(fact.relation);
  return back ? `${run.entities[fact.from]?.name ?? "It"} ${text}` : text;
}

/** The company that raised a round, from Cala's ISSUER relation. */
function issuer(round: string, run: Run): string | null {
  const fact = Object.values(run.facts).find((f) => f.to === round && f.role === "ISSUER");
  return fact ? (run.entities[fact.from]?.name ?? null) : null;
}

/** Every step of one route, each with its own logo and the Cala link to the next. */
function Chain({
  route,
  run,
  domains,
}: {
  route: Route;
  run: Run;
  domains: Record<string, string>;
}) {
  return (
    <ol className="mt-3 flex flex-col">
      {route.nodes.map((id, i) => {
        const entity = run.entities[id];
        const hop = route.hops[i];
        if (!entity) return null;
        return (
          <li key={id}>
            <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
              <Mark entity={entity} domain={domains[id]} size={24} />
              <span className="min-w-0 truncate text-[13px]">
                {entity.role === "round" && issuer(id, run) && (
                  <span className="text-dim">{issuer(id, run)} </span>
                )}
                {entity.name}
              </span>
              <span className="ml-auto shrink-0 pl-2 text-[11px] text-faint">
                {i === 0
                  ? "You"
                  : i === route.nodes.length - 1
                    ? "Investor"
                    : roleLabel[entity.role]}
              </span>
            </div>
            {hop && (
              <div
                className="ml-[16px] flex items-center gap-3 border-l py-1 pl-4"
                style={{ borderColor: `${route.color}80` }}
              >
                <span className="text-[11px] text-dim">{verb(hop, run)}</span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The only route as one line; the chevron opens its full chain. */
function Single({
  route,
  run,
  domains,
}: {
  route: Route;
  run: Run;
  domains: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg">
      <div className="flex items-center gap-2.5 pl-2 text-[13px]">
        <Glyph className="size-3.5 shrink-0" strokeWidth={2} style={{ color: route.color }} />
        <span className="min-w-0 truncate">{route.label}</span>
        <span className="ml-auto shrink-0 pl-3 font-mono text-[11px] text-faint">
          {kindLabel[route.kind]}
        </span>
        <button
          type="button"
          aria-label={open ? "Hide full path" : "Show full path"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="mx-1 grid size-7 shrink-0 place-items-center rounded-md text-faint transition hover:bg-hover hover:text-text"
        >
          <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="animate-rise px-2 pb-1 [&>ol]:mt-1">
          <Chain route={route} run={run} domains={domains} />
          <Fold close={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** Collapse control at the end of an open path, so a long chain folds without scrolling up. */
function Fold({ close }: { close: () => void }) {
  return (
    <div className="flex justify-end pt-1">
      <button
        type="button"
        onClick={close}
        aria-label="Hide full path"
        className="grid size-7 place-items-center rounded-md text-faint transition hover:bg-hover hover:text-text"
      >
        <ChevronUp className="size-3.5" />
      </button>
    </div>
  );
}
