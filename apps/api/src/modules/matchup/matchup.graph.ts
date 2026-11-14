import type {
  Cite,
  Connection,
  Entity,
  Fact,
  MatchupEvent,
  MatchupGraph,
  Role,
} from "@repo/shared";
import { cites, repair } from "../onboarding/onboarding.service";
import {
  type AgentAnswer,
  rawEntitySchema,
  rawLinkSchema,
  rawOriginSchema,
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
      // knowledge_search sources: a citable URL but no date. Named by domain like every other
      // source; their own names are page titles.
      if (Array.isArray(node.origins)) {
        for (const origin of node.origins) {
          const source = rawOriginSchema.safeParse(origin);
          if (source.success) raw.push({ document: source.data.document.url });
        }
      }

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

/**
 * What a saved run learned from Cala, read back from its events: tool results, the context a
 * follow-up inherited, and the final graph with its evidence. Seeds a follow-up's ledger.
 */
export function replay(events: MatchupEvent[]): Harvest {
  const entities: Entity[] = [];
  const facts: Fact[] = [];
  const found: Cite[] = [];
  for (const event of events) {
    if (event.type === "tool-result" || event.type === "follow-up") {
      entities.push(...event.entities);
      facts.push(...event.facts);
    } else if (event.type === "done") {
      // Last, so the answer's investor roles win over what the tool results said.
      entities.push(...event.graph.entities);
      for (const pick of event.graph.investors) found.push(...pick.evidence);
      for (const link of event.graph.connections) {
        facts.push(...link.facts);
        found.push(...link.evidence);
      }
    }
  }
  return { entities, facts, cites: found };
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
 * When a relation was first reported: its earliest dated source. Later dates are often
 * re-crawls of a portfolio page, so the earliest one is closest to the announcement.
 */
export function dealDate(fact: Fact): string | null {
  return fact.sources.reduce<string | null>(
    (min, source) => (source.date && (!min || source.date < min) ? source.date : min),
    null,
  );
}

/** Sourced Cala records of what an investor backed, newest first. Backs a pick the agent left unsourced. */
export function backing(facts: Fact[], id: string, limit = 5): Cite[] {
  const byUrl = new Map<string, Cite>();
  for (const fact of facts) {
    const invested = fact.role === "INVESTOR" || fact.relation === "INVESTED_IN";
    if (fact.from !== id || !invested) continue;
    for (const cite of fact.sources)
      if (cite.url && !byUrl.has(cite.url)) byUrl.set(cite.url, cite);
  }
  return [...byUrl.values()]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, limit);
}

/**
 * Turns the agent's answer into a graph that only holds what Cala returned:
 * unknown ids, unseen URLs, investors without a source and connections without evidence
 * are dropped.
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

  // A pick needs a known id and a source: the ones the agent cited that the run returned,
  // or, when it cited none, the sourced records of what the investor backed.
  const investors: MatchupGraph["investors"] = [];
  for (const pick of answer.investors) {
    if (investors.some((kept) => kept.id === pick.id)) continue;
    if (!known(pick.id)) {
      dropped++;
      continue;
    }
    const cited = new Map<string, Cite>();
    for (const url of pick.evidence) {
      const cite = byUrl.get(normalizeUrl(url));
      if (cite?.url) cited.set(cite.url, cite);
      else dropped++;
    }
    const evidence = cited.size ? [...cited.values()] : backing(facts, pick.id);
    if (!evidence.length) {
      dropped++;
      continue;
    }
    investors.push({ id: pick.id, why: pick.why, evidence });
  }

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

/**
 * Keeps the useful part of a run when the agent stops before submitting its answer.
 * These are candidates backed by sourced Cala facts, not a finalized recommendation.
 */
export function partialGraph(
  ledger: Ledger,
  meta: { sessionId: string; companyId: string; companyName: string },
): MatchupGraph {
  const facts = [...ledger.facts.values()];
  const candidates = new Map<string, { facts: number; evidence: Cite[] }>();

  for (const fact of facts) {
    const investing = fact.role?.toUpperCase() === "INVESTOR" || fact.relation === "INVESTED_IN";
    if (!investing || fact.from === meta.companyId || !ledger.entities.has(fact.from)) continue;
    const existing = candidates.get(fact.from) ?? { facts: 0, evidence: [] };
    existing.facts += 1;
    const urls = new Set(existing.evidence.map((cite) => cite.url ?? cite.name));
    for (const cite of fact.sources) {
      const key = cite.url ?? cite.name;
      if (!urls.has(key)) {
        existing.evidence.push(cite);
        urls.add(key);
      }
    }
    candidates.set(fact.from, existing);
  }

  const investors = [...candidates.entries()]
    .map(([id, candidate]) => ({
      id,
      candidate,
      entity: ledger.entities.get(id),
    }))
    .filter((item): item is typeof item & { entity: Entity } =>
      Boolean(item.entity && item.candidate.evidence.length),
    )
    .sort((a, b) => b.candidate.facts - a.candidate.facts)
    .slice(0, 5)
    .map(({ id, candidate }) => ({
      id,
      why: "Found in sourced funding records explored before the search stopped.",
      evidence: candidate.evidence.slice(0, 4),
    }));

  const company =
    ledger.entities.get(meta.companyId) ??
    ({
      id: meta.companyId,
      name: meta.companyName,
      type: "Company",
      role: "company",
    } satisfies Entity);
  const entityIds = new Set([meta.companyId, ...investors.map((investor) => investor.id)]);
  const entities = [
    company,
    ...investors.flatMap((investor) => {
      const entity = ledger.entities.get(investor.id);
      return entity ? [{ ...entity, role: "investor" as const }] : [];
    }),
  ];

  return {
    sessionId: meta.sessionId,
    companyId: meta.companyId,
    summary: investors.length
      ? "This search stopped before the full match was finalized. These candidates were found in the sourced records explored so far."
      : "This search stopped before the agent found a sourced investor match. Run it again to continue the search.",
    entities: entities.filter((entity) => entityIds.has(entity.id)),
    investors,
    connections: [],
    dropped: 0,
  };
}
