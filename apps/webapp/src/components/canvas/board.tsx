"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  type EdgeTypes,
  type NodeTypes,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { Maximize2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { columns, layout, nearest, type Run } from "@/lib/matchup";
import { EntityNodeComponent } from "./entity-node";
import { flow, highlight, mute, pair, type Route, segments } from "./graph";
import { LinkEdgeComponent } from "./link-edge";

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "connection"; id: string }
  | { kind: "fact"; key: string }
  | null;

const MAX_NODES = 60;

export const nodeTypes: NodeTypes = { entity: EntityNodeComponent };
export const edgeTypes: EdgeTypes = { link: LinkEdgeComponent };

interface Props {
  run: Run;
  companyId: string;
  explored: boolean;
  selection: Selection;
  select: (selection: Selection) => void;
  /** Side panel open; the canvas refits after it slides */
  panel: boolean;
  domains: Record<string, string>;
  /** One investor's routes to light up, and the route shown on its own */
  focus?: { routes: Route[]; active: number | null } | null;
  /** Every route of every investor; hovering a link lights the ones through it */
  paths?: Route[];
  /** Captions under nodes, for the full screen view */
  labels?: boolean;
  /** Opens the full screen view; shown as a control when given */
  expand?: () => void;
}

/** The playground: every node and edge comes from Cala tool results in `run`. */
export function Board(props: Props) {
  const {
    run,
    companyId,
    explored,
    selection,
    select,
    panel,
    domains,
    focus,
    labels,
    expand,
    paths,
  } = props;
  const { fitView } = useReactFlow();
  // Entity pair of the link under the pointer, for exposing the routes it carries.
  const [over, setOver] = useState<string | null>(null);
  const { graph } = run;

  const { nodes, edges } = useMemo(() => {
    const facts = Object.values(run.facts);
    const final = new Set(graph?.entities.map((e) => e.id) ?? []);
    const showAll = !graph || explored;

    const ids = new Set<string>([companyId]);
    if (showAll) for (const f of facts) ids.add(f.from).add(f.to);
    for (const id of final) ids.add(id);
    // Explored graphs reach hundreds of entities; keep the closest ones readable.
    const shown = nearest(
      companyId,
      [...ids].filter((id) => run.entities[id]),
      facts.map((f): [string, string] => [f.from, f.to]),
      run.entities,
      MAX_NODES,
    );

    const parts = segments(graph?.connections ?? []);
    const pair = (a: string, b: string) => [a, b].sort().join("|");
    const covered = new Set(parts.map((s) => pair(s.from, s.to)));
    const visible = new Set(shown);
    const raw = showAll
      ? facts.filter(
          (f) => visible.has(f.from) && visible.has(f.to) && !covered.has(pair(f.from, f.to)),
        )
      : [];

    const links = [
      ...parts.map((s): [string, string] => [s.from, s.to]),
      ...raw.map((f): [string, string] => [f.from, f.to]),
    ];
    const ends = new Set(graph?.investors.map((p) => p.id) ?? []);
    const placed = showAll
      ? layout(companyId, shown, links, run.entities)
      : columns(companyId, shown, links, run.entities, ends);
    // Captions hang under each node, so levels need more room between rows.
    const positions = labels
      ? Object.fromEntries(
          Object.entries(placed).map(([id, p]) => [id, { x: p.x * 1.05, y: p.y * 1.7 }]),
        )
      : placed;

    const base = flow({
      run,
      companyId,
      shown,
      segments: parts,
      facts: raw,
      positions,
      faded: (id) => Boolean(graph) && !final.has(id),
      domains,
      selection,
      labels: labels ?? false,
    });
    if (showAll) return base;
    if (focus) return highlight(base, focus.routes, focus.active);
    const through = over
      ? (paths ?? []).filter((r) => r.hops.some((h) => pair(h.from, h.to) === over))
      : [];
    return through.length ? highlight(base, through, null, "#c6ec6a") : mute(base);
  }, [run, graph, companyId, explored, selection, domains, focus, labels, over, paths]);

  // Keep everything in view while the agent adds nodes, and once more when it finishes.
  const count = Object.keys(run.entities).length + nodes.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refit only when the node count or status changes
  useEffect(() => {
    const timer = setTimeout(() => fitView({ duration: 600, padding: 0.18, maxZoom: 1.1 }), 340);
    return () => clearTimeout(timer);
  }, [count, run.status, explored, panel, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodeOrigin={[0.5, 0.5]}
      colorMode="dark"
      minZoom={0.05}
      maxZoom={2}
      nodesDraggable
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => node.type === "entity" && select({ kind: "node", id: node.id })}
      onEdgeMouseEnter={(_, edge) => setOver(pair(edge.source, edge.target))}
      onEdgeMouseLeave={() => setOver(null)}
      onEdgeClick={(_, edge) =>
        select(
          edge.id.startsWith("f:")
            ? { kind: "fact", key: edge.id.slice(2) }
            : { kind: "connection", id: edge.id.split(":")[0] ?? edge.id },
        )
      }
      onPaneClick={() => select(null)}
      className="board"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#2b2b30" />
      <Controls showInteractive={false} showFitView={!expand} position="bottom-left">
        {expand && (
          <ControlButton onClick={expand} aria-label="View full screen" title="Full screen">
            <Maximize2 />
          </ControlButton>
        )}
      </Controls>
    </ReactFlow>
  );
}
