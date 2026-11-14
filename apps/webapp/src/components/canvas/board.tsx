"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  Controls,
  type EdgeTypes,
  type NodeTypes,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo } from "react";
import { columns, factKey, layout, nearest, type Run } from "@/lib/matchup";
import { type EntityNode, EntityNodeComponent } from "./entity-node";
import { type LinkEdge, LinkEdgeComponent } from "./link-edge";
import { kindColor } from "./style";

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "connection"; id: string }
  | { kind: "fact"; key: string }
  | null;

const MAX_NODES = 60;

const nodeTypes: NodeTypes = { entity: EntityNodeComponent };
const edgeTypes: EdgeTypes = { link: LinkEdgeComponent };

interface Props {
  run: Run;
  companyId: string;
  explored: boolean;
  selection: Selection;
  select: (selection: Selection) => void;
  /** Side panel open; the canvas refits after it slides */
  panel: boolean;
}

/** The playground: every node and edge comes from Cala tool results in `run`. */
export function Board({ run, companyId, explored, selection, select, panel }: Props) {
  const { fitView } = useReactFlow();
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

    // Reasoned connections become one segment per hop: from → via… → to.
    const segments = (graph?.connections ?? []).flatMap((c) => {
      const chain = [c.from, ...c.via, c.to];
      return chain
        .slice(1)
        .map((to, i) => ({ id: `${c.id}:${i}`, c, from: chain[i] ?? c.from, to, i }));
    });
    const pair = (a: string, b: string) => [a, b].sort().join("|");
    const covered = new Set(segments.map((s) => pair(s.from, s.to)));
    const visible = new Set(shown);
    const rawFacts = showAll
      ? facts.filter(
          (f) => visible.has(f.from) && visible.has(f.to) && !covered.has(pair(f.from, f.to)),
        )
      : [];

    const positions = (showAll ? layout : columns)(
      companyId,
      shown,
      [
        ...segments.map((s): [string, string] => [s.from, s.to]),
        ...rawFacts.map((f): [string, string] => [f.from, f.to]),
      ],
      run.entities,
    );

    // A round reads "Series A · Swarmia": the issuer comes from Cala's ISSUER relation.
    const issuer = new Map(
      facts.filter((f) => f.role === "ISSUER").map((f) => [f.to, run.entities[f.from]?.name]),
    );

    const ranks = new Map(graph?.investors.map((pick, i) => [pick.id, i + 1]) ?? []);
    const focus = selection?.kind === "node" ? selection.id : null;

    const nodes: EntityNode[] = shown.flatMap((id) => {
      const entity = run.entities[id];
      const position = positions[id];
      if (!entity || !position) return [];
      return [
        {
          id,
          type: "entity",
          position,
          selected: focus === id,
          data: {
            entity,
            rank: ranks.get(id) ?? null,
            of: entity.role === "round" ? (issuer.get(id) ?? null) : null,
            center: id === companyId,
            faded: Boolean(graph) && !final.has(id),
          },
        },
      ];
    });

    const edges: LinkEdge[] = [
      ...rawFacts.map(
        (f): LinkEdge => ({
          id: `f:${factKey(f)}`,
          source: f.from,
          target: f.to,
          type: "link",
          data: {
            color: "#ffffff",
            reasoned: false,
            label: null,
            active: selection?.kind === "fact" && selection.key === factKey(f),
            faded: Boolean(graph),
          },
        }),
      ),
      ...segments.map(
        (s): LinkEdge => ({
          id: s.id,
          source: s.from,
          target: s.to,
          type: "link",
          data: {
            color: kindColor[s.c.kind],
            reasoned: true,
            label: s.i === 0 ? s.c.label : null,
            open: () => select({ kind: "connection", id: s.c.id }),
            active:
              (selection?.kind === "connection" && selection.id === s.c.id) ||
              (focus !== null && (s.from === focus || s.to === focus)),
            faded: false,
          },
        }),
      ),
    ];
    return { nodes, edges };
  }, [run.entities, run.facts, graph, companyId, explored, selection, select]);

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
      onNodeClick={(_, node) => select({ kind: "node", id: node.id })}
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
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}
