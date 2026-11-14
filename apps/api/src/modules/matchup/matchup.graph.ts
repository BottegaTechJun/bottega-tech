import type { Cite, Connection, Entity, Fact, MatchupGraph, Role } from "@repo/shared";
import { cites, repair } from "../onboarding/onboarding.service";
import {
  type AgentAnswer,
  rawEntitySchema,
  rawLinkSchema,
  rawRetrievalSchema,
} from "./matchup.schemas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JUNK =
  /^(co-?founders?|founders?|ceo|cto|angels?|angel investors?|investors?|unknown|n\/a)$/i;

/** Entities, relationships and source documents seen in one tool result. */
export interface Harvest {
  entities: Entity[];
  facts: Fact[];
  cites: Cite[];
}

function roleOf(type: string): Role {
  if (type === "FundingRound") return "round";
  if (type === "Person") return "person";
  if (type === "Event") return "event";
  if (type === "Company" || type === "Organization") return "company";
  return "other";
}

/** MCP results carry JSON in `structuredContent` or as text; return whatever parses. */
function payloads(output: unknown): unknown[] {
  if (!output || typeof output !== "object") return [output];
  const record = output as Record<string, unknown>;
  const out: unknown[] = [];
  if (record.structuredContent !== undefined) out.push(record.structuredContent);
  else if (Array.isArray(record.content)) {
    for (const part of record.content) {
      const text = (part as { text?: unknown }).text;
      if (typeof text !== "string") continue;
      try {
        out.push(JSON.parse(text));
      } catch {
        // prose output (knowledge_search) has no JSON to read
      }
    }
  } else out.push(output);
  return out;
}

function walk(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    visit(node);
    for (const child of Object.values(node)) walk(child, visit);
  }
}

/** Reads every entity, relationship and source document out of a Cala MCP tool result. */
export function harvest(output: unknown): Harvest {
  const entities = new Map<string, Entity>();
  const facts: Fact[] = [];
  const raw: { name?: string | null; document?: string | null; date?: string | null }[] = [];

  for (const root of payloads(output)) {
    walk(root, (node) => {
      const entity = rawEntitySchema.safeParse(node);
      if (entity.success && UUID.test(entity.data.id) && !JUNK.test(entity.data.name.trim())) {
        const { id, name, entity_type: type } = entity.data;
        if (!entities.has(id))
          entities.set(id, { id, name: repair(name), type, role: roleOf(type) });
      }
      if (typeof node.document === "string" && node.document.startsWith("http")) raw.push(node);

      const retrieval = rawRetrievalSchema.safeParse(node);
      if (!retrieval.success) return;
      const self = retrieval.data.id;
      for (const [direction, groups] of Object.entries(retrieval.data.relationships)) {
        if (direction !== "outgoing" && direction !== "incoming") continue;
        for (const [relation, items] of Object.entries(groups as Record<string, unknown[]>)) {
          for (const item of items) {
            const link = rawLinkSchema.safeParse(item);
            if (!link.success || !UUID.test(link.data.id)) continue;
            const props = link.data.properties;
            facts.push({
              from: direction === "outgoing" ? self : link.data.id,
              to: direction === "outgoing" ? link.data.id : self,
              relation,
              role: props?.role ?? null,
              lead: props?.is_lead === true ? true : null,
              sources: cites(props?.sources ?? []),
            });
          }
        }
      }
    });
  }

  // Whoever invests is an investor, whatever its entity type says.
  for (const fact of facts) {
    const investing = fact.relation === "INVESTED_IN" || fact.role === "INVESTOR";
    const entity = entities.get(fact.from);
    if (investing && entity && entity.role === "company") entity.role = "investor";
  }

  return { entities: [...entities.values()], facts, cites: cites(raw) };
}

/** Everything learned during one run, merged across tool results. */
export function createLedger() {
  const entities = new Map<string, Entity>();
  const facts = new Map<string, Fact>();
  const sources = new Map<string, Cite>();

  return {
    add(found: Harvest) {
      for (const entity of found.entities) {
        const known = entities.get(entity.id);
        if (!known || (entity.role === "investor" && known.role === "company")) {
          entities.set(entity.id, entity);
        }
      }
      for (const fact of found.facts) {
        facts.set(`${fact.from}|${fact.relation}|${fact.to}|${fact.role ?? ""}`, fact);
        for (const cite of fact.sources) if (cite.url) sources.set(cite.url, cite);
      }
      for (const cite of found.cites) if (cite.url) sources.set(cite.url, cite);
    },
    entities,
    facts,
    sources,
  };
}
export type Ledger = ReturnType<typeof createLedger>;

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Turns the agent's answer into a graph that only holds what Cala returned:
 * unknown ids, unseen URLs and connections without evidence are dropped.
 */
export function ground(
  answer: AgentAnswer,
  ledger: Ledger,
  meta: { sessionId: string; companyId: string },
): MatchupGraph {
  let dropped = 0;
  const known = (id: string) => ledger.entities.has(id);
  const byUrl = new Map([...ledger.sources.values()].map((c) => [normalizeUrl(c.url ?? ""), c]));
  const facts = [...ledger.facts.values()];

  const investors = answer.investors.filter((pick) => known(pick.id));
  dropped += answer.investors.length - investors.length;

  const connections: Connection[] = [];
  answer.connections.forEach((link, index) => {
    const via = link.via.filter((id) => id !== link.from && id !== link.to);
    if (!known(link.from) || !known(link.to) || !via.every(known)) {
      dropped++;
      return;
    }
    const evidence = link.evidence.flatMap((url) => {
      const cite = byUrl.get(normalizeUrl(url));
      if (!cite) dropped++;
      return cite ? [cite] : [];
    });
    const ends = new Set([link.from, link.to, ...via]);
    const backing = facts.filter((f) => ends.has(f.from) && ends.has(f.to));
    if (!evidence.length && !backing.length) {
      dropped++;
      return;
    }
    connections.push({
      id: `c${index}`,
      from: link.from,
      to: link.to,
      via,
      kind: link.kind,
      label: link.label,
      reasoning: link.reasoning,
      factors: link.factors,
      evidence,
      facts: backing,
    });
  });

  const used = new Set([
    meta.companyId,
    ...investors.map((pick) => pick.id),
    ...connections.flatMap((c) => [c.from, c.to, ...c.via]),
  ]);
  const entities = [...used].flatMap((id) => {
    const entity = ledger.entities.get(id);
    if (!entity) return [];
    const picked = investors.some((pick) => pick.id === id);
    return [
      picked && entity.role === "company" ? { ...entity, role: "investor" as const } : entity,
    ];
  });

  return {
    ...meta,
    summary: answer.summary,
    entities,
    investors,
    connections,
    dropped,
  };
}
