"use client";

import "@xyflow/react/dist/style.css";
import { Controls, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { Maximize2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { columns, type Run } from "@/lib/matchup";
import { edgeTypes, nodeTypes, type Selection } from "./board";
import { DetailPanel } from "./detail-panel";
import { flow, highlight, type Route, type Segment } from "./graph";
import { RouteList } from "./routes";

interface Props {
  run: Run;
  companyId: string;
  investorId: string;
  domains: Record<string, string>;
  select: (selection: Selection) => void;
  routes: Route[];
  /** Route shown on its own: hovered, else pinned */
  active: number | null;
  picked: number | null;
  hover: (index: number | null) => void;
  pick: (index: number | null) => void;
}

/** Small canvas with only the paths between one investor and the company, with a full screen view. */
export function Scope(props: Props) {
  const [full, setFull] = useState(false);
  const [focus, setFocus] = useState<Selection>(null);
  const name = props.run.entities[props.investorId]?.name ?? "Investor";
  const company = props.run.entities[props.companyId]?.name ?? "you";

  useEffect(() => {
    if (!full) return;
    // Esc closes the detail card first, then the full screen view.
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (focus) setFocus(null);
      else setFull(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [full, focus]);

  const close = () => {
    setFull(false);
    setFocus(null);
  };

  return (
    <>
      <div className="relative h-60 overflow-hidden rounded-2xl border border-line bg-ink">
        <ReactFlowProvider>
          <Inner {...props} labels={false} selection={null} />
        </ReactFlowProvider>
        <button
          type="button"
          onClick={() => setFull(true)}
          aria-label="View full screen"
          title="Full screen"
          className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-lg border border-line bg-panel/80 text-faint backdrop-blur transition hover:border-edge hover:text-text"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </div>

      {full &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Paths from ${company} to ${name}`}
            className="fixed inset-0 z-50 flex animate-rise flex-col bg-ink/95 p-2 backdrop-blur-sm"
          >
            <div className="flex min-h-0 flex-1 flex-col rounded-[20px] border border-line bg-panel">
              <header className="flex h-14 shrink-0 items-center gap-3 px-5">
                <h2 className="truncate text-sm font-medium">
                  {company} <span className="text-faint">to</span> {name}
                </h2>
                <span className="hidden text-[13px] text-faint sm:inline">
                  Click anything for details, hover a line to see the link
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close full screen"
                  className="ml-auto grid size-8 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-text"
                >
                  <X className="size-4" />
                </button>
              </header>
              <div className="relative min-h-0 flex-1">
                <ReactFlowProvider>
                  <Inner {...props} labels selection={focus} select={setFocus} />
                </ReactFlowProvider>
                <div className="absolute top-3 left-3 z-20 max-h-[calc(100%-1.5rem)] w-[min(420px,calc(100%-1.5rem))] overflow-y-auto rounded-2xl border border-line bg-panel/95 p-2 backdrop-blur">
                  <p className="px-2 pt-1 pb-1.5 text-[12px] text-faint">
                    {props.routes.length} {props.routes.length === 1 ? "path" : "paths"}
                  </p>
                  <RouteList
                    routes={props.routes}
                    picked={props.picked}
                    hover={props.hover}
                    pick={props.pick}
                    run={props.run}
                    domains={props.domains}
                  />
                </div>
                {focus && (
                  <div className="absolute top-12 right-3 z-20 flex max-h-[calc(100%-4rem)] w-[min(380px,calc(100%-1.5rem))] animate-rise flex-col rounded-2xl border border-edge bg-panel shadow-[0_16px_48px_rgb(0_0_0/0.5)]">
                    <div className="flex h-10 shrink-0 items-center justify-end px-1.5">
                      <button
                        type="button"
                        onClick={() => setFocus(null)}
                        aria-label="Close details"
                        className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-text"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <div className="min-h-0 overflow-y-auto px-4 pb-4">
                      <DetailPanel run={props.run} selection={focus} select={setFocus} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Inner({
  run,
  companyId,
  investorId,
  domains,
  select,
  labels,
  selection,
  routes,
  active,
}: Props & { labels: boolean; selection: Selection }) {
  const { fitView } = useReactFlow();

  const { nodes, edges } = useMemo(() => {
    // One drawn link per entity pair, remembering which routes run over it.
    const pairs = new Map<string, { seg: Segment; on: Set<number> }>();
    routes.forEach((route, r) => {
      for (const h of route.hops) {
        const key = [h.from, h.to].sort().join("|");
        const known = pairs.get(key);
        if (known) known.on.add(r);
        else
          pairs.set(key, {
            seg: { id: `${h.c.id}:${pairs.size}`, c: h.c, from: h.from, to: h.to, i: 0 },
            on: new Set([r]),
          });
      }
    });
    const parts = [...pairs.values()].map((p) => p.seg);
    const shown = [
      ...new Set([companyId, investorId, ...routes.flatMap((route) => route.nodes)]),
    ].filter((id) => run.entities[id]);
    const placed = columns(
      companyId,
      shown,
      parts.map((part): [string, string] => [part.from, part.to]),
      run.entities,
      new Set([investorId]),
    );
    // Left to right: the company starts, the investor ends; captions need more room.
    const [sx, sy] = labels ? [0.9, 1.7] : [0.6, 1];
    const positions = Object.fromEntries(
      Object.entries(placed).map(([id, p]) => [id, { x: p.x * sx, y: p.y * sy }]),
    );
    const base = flow({
      run,
      companyId,
      shown,
      segments: parts,
      facts: [],
      positions,
      faded: () => false,
      domains,
      selection,
      labels,
    });
    return highlight(base, routes, active);
  }, [run, companyId, investorId, domains, labels, selection, routes, active]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refit when the investor or its path changes
  useEffect(() => {
    const timer = setTimeout(
      () => fitView({ duration: 400, padding: labels ? 0.15 : 0.22, maxZoom: labels ? 1.4 : 1.2 }),
      80,
    );
    return () => clearTimeout(timer);
  }, [investorId, nodes.length, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodeOrigin={[0.5, 0.5]}
      colorMode="dark"
      fitView
      minZoom={0.2}
      maxZoom={2}
      nodesDraggable={labels}
      nodesConnectable={false}
      zoomOnScroll={labels}
      preventScrolling={labels}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => node.type === "entity" && select({ kind: "node", id: node.id })}
      onEdgeClick={(_, edge) => select({ kind: "connection", id: edge.id.split(":")[0] ?? "" })}
      onPaneClick={() => labels && select(null)}
      className="board"
    >
      {labels && <Controls showInteractive={false} position="bottom-right" />}
    </ReactFlow>
  );
}
