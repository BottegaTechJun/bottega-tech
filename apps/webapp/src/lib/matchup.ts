import {
  apiErrorSchema,
  type Entity,
  type Fact,
  type MatchupEvent,
  type MatchupGraph,
  type MatchupReplay,
  type MatchupRequest,
  matchupEventSchema,
  matchupReplaySchema,
} from "@repo/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ---------- Stream client ----------

/** Posts a lookup and calls `onEvent` for every Server-Sent Event until the stream ends. */
export async function streamMatchup(
  req: MatchupRequest,
  onEvent: (event: MatchupEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/matchup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    const body: unknown = await res.json().catch(() => undefined);
    const parsed = apiErrorSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : `Request failed (${res.status})`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let cut = buffer.indexOf("\n\n");
    while (cut >= 0) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      cut = buffer.indexOf("\n\n");
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (!data) continue;
      const parsed = matchupEventSchema.safeParse(JSON.parse(data));
      if (parsed.success) onEvent(parsed.data);
    }
  }
}

/** The last saved run for a company, or null when there is none. */
export async function lastMatchup(companyId: string): Promise<MatchupReplay | null> {
  const res = await fetch(`${API_URL}/api/matchup/${encodeURIComponent(companyId)}/last`).catch(
    () => null,
  );
  if (!res?.ok) return null;
  const parsed = matchupReplaySchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

// ---------- Run state ----------

export type Status = "idle" | "running" | "done" | "incomplete";

export type TraceItem =
  | { kind: "step"; key: string; step: number }
  | { kind: "thinking"; key: string; text: string }
  | {
      kind: "tool";
      key: string;
      tool: string;
      input: string;
      result: { ok: boolean; summary: string; found: number } | null;
    }
  | { kind: "error"; key: string; message: string };

export interface Run {
  status: Status;
  sessionId: string | null;
  model: string | null;
  traceUrl: string | null;
  startedAt: number | null;
  /** When the run came from the saved replay, its save time */
  savedAt: string | null;
  error: string | null;
  trace: TraceItem[];
  entities: Record<string, Entity>;
  facts: Record<string, Fact>;
  graph: MatchupGraph | null;
}

export const idle: Run = {
  status: "idle",
  sessionId: null,
  model: null,
  traceUrl: null,
  startedAt: null,
  savedAt: null,
  error: null,
  trace: [],
  entities: {},
  facts: {},
  graph: null,
};

export type Action =
  | { type: "begin"; sessionId: string }
  | { type: "event"; event: MatchupEvent }
  | { type: "fail"; message: string }
  | { type: "replay"; saved: MatchupReplay };

export const factKey = (f: Fact) => `${f.from}|${f.relation}|${f.to}|${f.role ?? ""}`;

function addEntities(into: Record<string, Entity>, list: Entity[]): Record<string, Entity> {
  const next = { ...into };
  for (const entity of list) {
    const known = next[entity.id];
    if (!known || (entity.role === "investor" && known.role !== "investor")) {
      next[entity.id] = entity;
    }
  }
  return next;
}

function apply(run: Run, event: MatchupEvent): Run {
  switch (event.type) {
    case "start":
      return { ...run, sessionId: event.sessionId, model: event.model, traceUrl: event.traceUrl };
    case "step":
      return {
        ...run,
        trace: [...run.trace, { kind: "step", key: `s${event.step}`, step: event.step }],
      };
    case "thinking": {
      const key = `t${event.id}`;
      const last = run.trace.at(-1);
      if (last?.kind === "thinking" && last.key === key) {
        return {
          ...run,
          trace: [...run.trace.slice(0, -1), { ...last, text: last.text + event.text }],
        };
      }
      return { ...run, trace: [...run.trace, { kind: "thinking", key, text: event.text }] };
    }
    case "tool-call":
      return {
        ...run,
        trace: [
          ...run.trace,
          { kind: "tool", key: event.id, tool: event.tool, input: event.input, result: null },
        ],
      };
    case "tool-result": {
      const facts = { ...run.facts };
      for (const fact of event.facts) facts[factKey(fact)] = fact;
      const result = { ok: event.ok, summary: event.summary, found: event.entities.length };
      const hit = run.trace.some((item) => item.key === event.id);
      const trace = hit
        ? run.trace.map((item) =>
            item.kind === "tool" && item.key === event.id ? { ...item, result } : item,
          )
        : [
            ...run.trace,
            { kind: "tool" as const, key: event.id, tool: event.tool, input: "", result },
          ];
      return { ...run, trace, facts, entities: addEntities(run.entities, event.entities) };
    }
    case "done":
      return {
        ...run,
        status: "done",
        graph: event.graph,
        entities: addEntities(run.entities, event.graph.entities),
      };
    case "error":
      return {
        ...run,
        status: "incomplete",
        error: event.message,
        trace: [
          ...run.trace,
          { kind: "error", key: `e${run.trace.length}`, message: event.message },
        ],
      };
  }
}

export function reduce(run: Run, action: Action): Run {
  switch (action.type) {
    case "begin":
      return { ...idle, status: "running", sessionId: action.sessionId, startedAt: Date.now() };
    case "event":
      return apply(run, action.event);
    case "replay": {
      const begun: Run = { ...idle, status: "running", savedAt: action.saved.savedAt };
      const played = action.saved.events.reduce(apply, begun);
      return played.status === "running" ? { ...played, status: "incomplete" } : played;
    }
    case "fail":
      if (run.status !== "running") return run;
      return {
        ...run,
        status: "incomplete",
        error: action.message,
        trace: [
          ...run.trace,
          { kind: "error", key: `e${run.trace.length}`, message: action.message },
        ],
      };
  }
}

/** A stream that ends without `done` or `error` still counts as incomplete. */
export function settle(run: Run): Run {
  return run.status === "running"
    ? reduce(run, { type: "fail", message: "The stream ended before the agent finished" })
    : run;
}

// ---------- Layout ----------

export interface Point {
  x: number;
  y: number;
}

const ORDER = ["company", "investor", "round", "person", "event", "other"];

/** Hop distance of every linked entity from `center`, plus each entity's neighbours. */
export function hops(center: string, links: [string, string][]) {
  const near = new Map<string, Set<string>>();
  for (const [a, b] of links) {
    if (!near.has(a)) near.set(a, new Set());
    if (!near.has(b)) near.set(b, new Set());
    near.get(a)?.add(b);
    near.get(b)?.add(a);
  }
  const hop = new Map<string, number>([[center, 0]]);
  const queue = [center];
  while (queue.length) {
    const id = queue.shift() as string;
    for (const next of near.get(id) ?? []) {
      if (hop.has(next)) continue;
      hop.set(next, (hop.get(id) ?? 0) + 1);
      queue.push(next);
    }
  }
  return { hop, near, far: Math.max(0, ...hop.values()) + 1 };
}

function group(center: string, ids: string[], hop: Map<string, number>, far: number) {
  const rings = new Map<number, string[]>();
  for (const id of ids) {
    if (id === center) continue;
    const ring = hop.get(id) ?? far;
    rings.set(ring, [...(rings.get(ring) ?? []), id]);
  }
  return [...rings.entries()].sort(([a], [b]) => a - b);
}

function byRole(entities: Record<string, Entity>) {
  return (a: string, b: string) => {
    const ea = entities[a];
    const eb = entities[b];
    const role = ORDER.indexOf(ea?.role ?? "other") - ORDER.indexOf(eb?.role ?? "other");
    return role || (ea?.name ?? a).localeCompare(eb?.name ?? b);
  };
}

/**
 * Radial layout for exploring: the company in the middle, every other entity on a ring
 * by its hop distance. Rings grow with the number of nodes so labels don't collide.
 */
export function layout(
  center: string,
  ids: string[],
  links: [string, string][],
  entities: Record<string, Entity>,
): Record<string, Point> {
  const { hop, far } = hops(center, links);
  const out: Record<string, Point> = { [center]: { x: 0, y: 0 } };
  let radius = 0;
  for (const [ring, members] of group(center, ids, hop, far)) {
    members.sort(byRole(entities));
    radius = Math.max(radius + 170, (members.length * 90) / (2 * Math.PI));
    const offset = ring * 0.6;
    members.forEach((id, index) => {
      const angle = offset + (index / members.length) * Math.PI * 2;
      out[id] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
  }
  return out;
}

/**
 * Path layout for the answer, read left to right: the company starts on the left, every
 * other entity sits one column per hop, and `ends` (the suggested investors) always close
 * the graph in the last column. Each column is ordered by its neighbours' height.
 */
export function columns(
  center: string,
  ids: string[],
  links: [string, string][],
  entities: Record<string, Entity>,
  ends: Set<string> = new Set(),
): Record<string, Point> {
  const { near } = hops(center, links);
  const { hop } = hops(
    center,
    links.filter(([a, b]) => !ends.has(a) && !ends.has(b)),
  );
  const inner = ids.filter((id) => id !== center && !ends.has(id));
  const last = Math.max(0, ...inner.map((id) => hop.get(id) ?? 0));
  const stray = inner.some((id) => !hop.has(id));
  const col = new Map(hop);
  for (const id of inner) if (!col.has(id)) col.set(id, last + 1);
  for (const id of ids) if (ends.has(id)) col.set(id, last + (stray ? 2 : 1));
  const far = Math.max(1, ...col.values());

  const out: Record<string, Point> = { [center]: { x: 0, y: 0 } };
  for (const [index, members] of group(center, ids, col, far)) {
    const height = (id: string) => {
      const ys = [...(near.get(id) ?? [])].flatMap((n) => {
        const p = out[n];
        return p && (col.get(n) ?? far) < index ? [p.y] : [];
      });
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
    };
    members.sort((a, b) => height(a) - height(b) || byRole(entities)(a, b));
    const gap = 76;
    members.forEach((id, i) => {
      out[id] = { x: index * 200, y: (i - (members.length - 1) / 2) * gap };
    });
  }
  return out;
}

/** The `limit` entities closest to `center`, investors first within each hop. */
export function nearest(
  center: string,
  ids: string[],
  links: [string, string][],
  entities: Record<string, Entity>,
  limit: number,
): string[] {
  if (ids.length <= limit) return ids;
  const { hop, far } = hops(center, links);
  const rank = (id: string) =>
    (hop.get(id) ?? far) * 10 + ORDER.indexOf(entities[id]?.role ?? "other");
  return [...ids].sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}
