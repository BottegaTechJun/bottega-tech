"use client";

import type { Entity } from "@repo/shared";
import { ChevronRight, ListChecks, X } from "lucide-react";
import { useState } from "react";
import type { Run } from "@/lib/matchup";
import { Actions, actions } from "./actions";
import type { Route } from "./graph";
import { RouteList } from "./routes";

interface Props {
  run: Run;
  companyId: string;
  /** Offers a Next steps view in the card; only the full screen view turns it on */
  actionable?: boolean;
  investors: Entity[];
  domains: Record<string, string>;
  /** Investor whose paths are shown */
  chosen: Entity | null;
  choose: (id: string | null) => void;
  routes: Route[];
  picked: number | null;
  hover: (index: number | null) => void;
  pick: (index: number | null) => void;
  /** Every investor's routes, for the path count beside each name */
  all?: Route[];
}

/** Floating card on the graph: pick an investor, then walk its paths one by one. */
export function Picker(props: Props) {
  const { run, companyId, investors, domains, chosen, choose, routes, picked, hover, pick, all } =
    props;
  const [view, setView] = useState<"paths" | "steps">("paths");
  const steps = props.actionable && chosen ? actions(routes, run, companyId, chosen.id) : null;
  return (
    <div className="absolute top-3 left-3 z-10 max-h-[calc(100%-1.5rem)] w-[min(380px,calc(100%-1.5rem))] overflow-y-auto rounded-2xl border border-line bg-panel/95 p-2 backdrop-blur">
      {chosen ? (
        <div>
          <div className="flex items-baseline gap-2 px-2 pt-0.5 pb-1.5">
            <span className="min-w-0 truncate text-[13px] font-medium">{chosen.name}</span>
            <span className="font-mono text-[11px] text-faint">
              {routes.length} {routes.length === 1 ? "path" : "paths"}
            </span>
            {steps && steps.length > 0 && (
              <button
                type="button"
                aria-pressed={view === "steps"}
                onClick={() => setView(view === "steps" ? "paths" : "steps")}
                className={`ml-auto flex h-6 shrink-0 items-center gap-1 self-center rounded-full border px-2 text-[11px] transition ${
                  view === "steps"
                    ? "border-accent/40 bg-accent/10 text-text"
                    : "border-line text-dim hover:border-edge hover:text-text"
                }`}
              >
                <ListChecks className="size-3" />
                Next steps
              </button>
            )}
            <button
              type="button"
              onClick={() => choose(null)}
              aria-label="Show all investors"
              className={`${steps?.length ? "" : "ml-auto"} grid size-6 shrink-0 place-items-center self-center rounded-md text-faint transition hover:bg-raise hover:text-text`}
            >
              <X className="size-3.5" />
            </button>
          </div>
          {view === "steps" && steps ? (
            <Actions list={steps} domains={domains} pick={pick} picked={picked} />
          ) : (
            <RouteList
              routes={routes}
              picked={picked}
              hover={hover}
              pick={pick}
              run={run}
              domains={domains}
            />
          )}
        </div>
      ) : (
        <>
          <p className="px-2 pt-0.5 pb-1 text-[12px] text-faint">
            Pick an investor to see its paths
          </p>
          <ul className="flex flex-col">
            {investors.map((entity, i) => {
              const count = (all ?? []).filter((r) => r.nodes.at(-1) === entity.id).length;
              return (
                <li key={entity.id}>
                  <button
                    type="button"
                    onClick={() => choose(entity.id)}
                    className="group flex min-h-9 w-full items-center gap-3 rounded-lg px-2 text-left text-[13px] text-dim transition hover:bg-raise/60 hover:text-text"
                  >
                    <span className="w-4 font-mono text-[11px] text-faint tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 truncate">{entity.name}</span>
                    <span className="ml-auto shrink-0 pl-3 font-mono text-[11px] text-faint">
                      {count} {count === 1 ? "path" : "paths"}
                    </span>
                    <ChevronRight className="size-3.5 shrink-0 text-faint transition group-hover:text-text" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
