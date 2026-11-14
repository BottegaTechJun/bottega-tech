import type { Connection, ConnectionKind, Entity, Fact, MatchupGraph } from "@repo/shared";
import { MarkerType } from "@xyflow/react";
import { factKey, type Point, type Run } from "@/lib/matchup";
import type { Selection } from "./board";
import type { EntityNode } from "./entity-node";
import type { LinkEdge } from "./link-edge";
import { kindColor, relationText } from "./style";

export interface Segment {
  id: string;
  c: Connection;
  from: string;
  to: string;
  i: number;
}

/** A reasoned connection becomes one segment per hop: from → via… → to. */
export function segments(connections: Connection[]): Segment[] {
  return connections.flatMap((c) => {
    const chain = [c.from, ...c.via, c.to];
    return chain
      .slice(1)
      .map((to, i) => ({ id: `${c.id}:${i}`, c, from: chain[i] ?? c.from, to, i }));
  });
}

/** Node diameter: the company largest, picks next, everything else small. */
export function size(entity: Entity, center: boolean, rank: number | null): number {
  if (center) return 52;
  if (rank) return 44;
  return entity.role === "investor" || entity.role === "company" ? 34 : 30;
}

export const arrow = (color: string) => ({
  type: MarkerType.ArrowClosed,
  color,
  width: 11,
  height: 11,
});

interface Input {
  run: Run;
  companyId: string;
  shown: string[];
  segments: Segment[];
  facts: Fact[];
  positions: Record<string, Point>;
  /** Faded nodes were explored but are not in the answer */
  faded: (id: string) => boolean;
  domains: Record<string, string>;
  selection: Selection;
  /** Captions under every node instead of hover tooltips */
  labels?: boolean;
}

/** React Flow nodes and edges for a set of shown entities and links. */
export function flow(input: Input): { nodes: EntityNode[]; edges: LinkEdge[] } {
  const { run, companyId, shown, positions, domains, selection } = input;
  const all = Object.values(run.facts);
  // A round reads "Swarmia Series A": the issuer comes from Cala's ISSUER relation.
  const issuer = new Map(
    all.filter((f) => f.role === "ISSUER").map((f) => [f.to, run.entities[f.from]?.name]),
  );
  const ranks = new Map(run.graph?.investors.map((pick, i) => [pick.id, i + 1]) ?? []);
  const focus = selection?.kind === "node" ? selection.id : null;
  const sizes = new Map<string, number>();

  const nodes: EntityNode[] = shown.flatMap((id) => {
    const entity = run.entities[id];
    const position = positions[id];
    if (!entity || !position) return [];
    const rank = ranks.get(id) ?? null;
    const diameter = size(entity, id === companyId, rank);
    sizes.set(id, diameter);
    return [
      {
        id,
        type: "entity",
        position,
        selected: focus === id,
        data: {
          entity,
          rank,
          of: entity.role === "round" ? (issuer.get(id) ?? null) : null,
          center: id === companyId,
          faded: input.faded(id),
          domain: domains[id],
          size: diameter,
          labels: input.labels ?? false,
        },
      },
    ];
  });

  // A long link that would cut through a node in a middle level detours above or below it.
  const placed = nodes.map((n) => n.position);
  const detour = (a: string, b: string): number | null => {
    const p = positions[a];
    const q = positions[b];
    if (!p || !q) return null;
    const [lo, hi] = p.x < q.x ? [p, q] : [q, p];
    const between = placed.filter((n) => n.x > lo.x + 1 && n.x < hi.x - 1);
    const hit = between.some((n) => {
      const y = lo.y + ((hi.y - lo.y) * (n.x - lo.x)) / (hi.x - lo.x || 1);
      return Math.abs(n.y - y) < (input.labels ? 60 : 34);
    });
    if (!hit) return null;
    const ys = between.map((n) => n.y);
    const mid = (p.y + q.y) / 2;
    // Captions hang below nodes, so the lower route needs more room.
    const down = Math.max(...ys, p.y, q.y) + (input.labels ? 84 : 48);
    const up = Math.min(...ys, p.y, q.y) - 48;
    return down - mid <= mid - up ? down : up;
  };

  const gap = (a: string, b: string): [number, number] => [
    (sizes.get(a) ?? 28) / 2,
    (sizes.get(b) ?? 28) / 2,
  ];

  const edges: LinkEdge[] = [
    ...input.facts.map(
      (f): LinkEdge => ({
        id: `f:${factKey(f)}`,
        source: f.from,
        target: f.to,
        type: "link",
        markerEnd: arrow("#ffffff"),
        data: {
          color: "#ffffff",
          reasoned: false,
          label: relationText(f.relation),
          first: true,
          active: selection?.kind === "fact" && selection.key === factKey(f),
          faded: Boolean(run.graph),
          gap: gap(f.from, f.to),
        },
      }),
    ),
    ...input.segments.map((s): LinkEdge => {
      // Arrows always run left to right: from the company toward the investors.
      const flip = (positions[s.from]?.x ?? 0) > (positions[s.to]?.x ?? 0);
      const [source, target] = flip ? [s.to, s.from] : [s.from, s.to];
      return {
        id: s.id,
        source,
        target,
        type: "link",
        markerEnd: arrow(kindColor[s.c.kind]),
        data: {
          color: kindColor[s.c.kind],
          reasoned: true,
          label: s.c.label,
          first: s.i === 0,
          active:
            (selection?.kind === "connection" && selection.id === s.c.id) ||
            (focus !== null && (s.from === focus || s.to === focus)),
          faded: false,
          gap: gap(source, target),
          detour: detour(source, target),
        },
      };
    }),
  ];
  return { nodes, edges };
}

export interface Hop {
  /** In path order: toward the investor */
  from: string;
  to: string;
  c: Connection;
}

/** One route from the company to an investor through the answer's connections. */
export interface Route {
  id: string;
  nodes: string[];
  hops: Hop[];
  label: string;
  kind: ConnectionKind;
  color: string;
}

/** One hue per route; desaturated to sit on the dark canvas. */
export const PALETTE = [
  "#8fb4ff",
  "#c6ec6a",
  "#f2b36d",
  "#f08fb5",
  "#6fe0c4",
  "#c4a7ff",
  "#ffd27a",
  "#7fd0ff",
];

const MAX_HOPS = 8;
const MAX_ROUTES = 12;

/**
 * Every simple path from the company to one investor, built only from run data. Links count
 * both ways for reachability, keep their own label and kind, and never pass through another
 * suggested investor. Shortest first, capped in length and count.
 */
export function routes(
  graph: MatchupGraph,
  investor: string,
  company: string,
  entities: Record<string, Entity>,
): Route[] {
  const blocked = new Set(graph.investors.map((p) => p.id).filter((id) => id !== investor));
  const near = new Map<string, Map<string, Connection>>();
  const link = (a: string, b: string, c: Connection) => {
    if (!near.has(a)) near.set(a, new Map());
    const row = near.get(a);
    if (row && !row.has(b)) row.set(b, c);
  };
  // A connection that belongs to another suggested investor is left out whole.
  const own = graph.connections.filter((c) => !blocked.has(c.from) && !blocked.has(c.to));
  for (const s of segments(own)) {
    if (blocked.has(s.from) || blocked.has(s.to)) continue;
    link(s.from, s.to, s.c);
    link(s.to, s.from, s.c);
  }

  const found: Hop[][] = [];
  const walk = (at: string, seen: Set<string>, hops: Hop[]) => {
    if (found.length >= 200) return;
    if (at === investor) {
      found.push(hops);
      return;
    }
    if (hops.length >= MAX_HOPS) return;
    for (const [next, c] of near.get(at) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      walk(next, seen, [...hops, { from: at, to: next, c }]);
      seen.delete(next);
    }
  };
  walk(company, new Set([company]), []);

  const name = (id: string) => entities[id]?.name ?? "";
  const list = found
    .sort((a, b) => a.length - b.length)
    .slice(0, MAX_ROUTES)
    .map((hops) => {
      const last = hops.at(-1)?.c;
      return {
        nodes: [company, ...hops.map((h) => h.to)],
        hops,
        label: last?.label ?? "Linked",
        kind: last?.kind ?? ("other" as ConnectionKind),
      };
    });

  // Same closing link on two routes: name the first firm or person each one passes.
  const count = new Map<string, number>();
  for (const r of list) count.set(r.label, (count.get(r.label) ?? 0) + 1);
  return list.map((r, i) => {
    const via = r.nodes
      .slice(1, -1)
      .find((id) => entities[id] && entities[id].role !== "round" && entities[id].role !== "event");
    const label = (count.get(r.label) ?? 0) > 1 && via ? `${r.label}, via ${name(via)}` : r.label;
    return { ...r, id: r.nodes.join(">"), label, color: PALETTE[i % PALETTE.length] ?? "#9a9aa2" };
  });
}

/**
 * Lights up one investor's routes on a drawn graph: links on a route keep color, the rest fade.
 * With `active` set, only that route stays lit. Idle shared links stay neutral.
 */
/** Entity pair key for a link, the same either way round. */
export const pair = (a: string, b: string) => [a, b].sort().join("|");

/**
 * Quiet idle look for the answer graph: links go neutral and the entities between your
 * company and the investors step back, so the two ends carry the picture.
 */
export function mute(base: { nodes: EntityNode[]; edges: LinkEdge[] }) {
  const nodes = base.nodes.map((n) =>
    n.data.center || n.data.rank ? n : { ...n, data: { ...n.data, muted: true } },
  );
  const edges = base.edges.map((edge) => {
    const color = "#8b8b93";
    const data = edge.data && { ...edge.data, color };
    return { ...edge, markerEnd: arrow(color), ...(data ? { data } : {}) };
  });
  return { nodes, edges };
}

export function highlight(
  base: { nodes: EntityNode[]; edges: LinkEdge[] },
  list: Route[],
  active: number | null,
  /** One color for every lit link, used when exposing many investors' routes at once */
  tone?: string,
): { nodes: EntityNode[]; edges: LinkEdge[] } {
  const on = new Map<string, Set<number>>();
  list.forEach((route, r) => {
    for (const h of route.hops) {
      const key = pair(h.from, h.to);
      on.set(key, (on.get(key) ?? new Set()).add(r));
    }
  });
  const lit = active === null ? null : list[active];
  const keep = new Set(lit ? lit.nodes : list.flatMap((route) => route.nodes));
  const nodes = base.nodes.map((n) => ({
    ...n,
    data: { ...n.data, faded: n.data.faded || !keep.has(n.id) },
  }));
  const edges = base.edges.map((edge) => {
    const set = on.get(pair(edge.source, edge.target));
    const hit = lit ? set?.has(active ?? -1) === true : Boolean(set);
    const only = set?.size === 1 ? list[[...set][0] ?? 0] : undefined;
    const color = !hit ? "#9a9aa2" : (tone ?? (lit ? lit.color : (only?.color ?? "#b4b4bc")));
    const data = edge.data && {
      ...edge.data,
      color,
      active: hit && (Boolean(lit) || Boolean(tone)),
      faded: !hit,
    };
    return { ...edge, markerEnd: arrow(color), ...(data ? { data } : {}) };
  });
  return { nodes, edges };
}
