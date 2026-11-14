import type {
  Backer,
  Cite,
  CompanyMatch,
  CompanyMatches,
  Investor,
  Person,
  Profile,
  Rank,
  Round,
  TextFact,
  UpsertUser,
  User,
} from "@repo/shared";
import type { Database } from "../../lib/db";
import { HttpError } from "../../lib/http-error";
import type { CalaClient, CalaEntityRetrievalProjection } from "../cala/cala.client";
import type { CalaEntityIntrospectionResponse } from "../cala/cala.schemas";
import {
  type CalaCite,
  type CalaLink,
  type CalaProperty,
  type CalaRetrieval,
  retrievalSchema,
  type Snapshot,
  snapshotSchema,
} from "./onboarding.schemas";

export type OnboardingService = ReturnType<typeof createOnboardingService>;

export const SLUSH_2026 = "bc844d56-6ab4-452b-96bf-2661e86e592b";

const RANKS: Rank[] = ["FILING", "PRIMARY", "PRESS", "AGGREGATOR", "OTHER"];
const JUNK =
  /^(co-?founders?|founders?|ceo|cto|angels?|angel investors?|investors?|unknown|n\/a)$/i;
const TTL = 60 * 60 * 1000;

interface Options {
  /** Precomputed results served instantly (the demo company) */
  snapshot?: unknown;
  /** Optional Aiven Postgres database for caching public company profiles */
  db?: Database | null;
  now?: () => number;
}

/** Builds the onboarding view of a company from Cala's entity endpoints. */
export function createOnboardingService(cala: CalaClient, options: Options = {}) {
  // Narrow the shared client's loose responses to the fields read here.
  const client = {
    searchCompanies: (name: string, limit: number) =>
      cala.entity_search(name, { limit, entityTypes: ["Company"] }),
    introspect: (id: string) => cala.entity_introspection(id),
    async retrieve(id: string, projection: CalaEntityRetrievalProjection): Promise<CalaRetrieval> {
      const parsed = retrievalSchema.safeParse(await cala.entity_retrieval(id, projection));
      if (parsed.success) return parsed.data;
      throw new HttpError(502, "upstream_invalid_response", "Unexpected Cala entity shape");
    },
  };
  const now = options.now ?? Date.now;
  const db = options.db ?? null;
  const seed: Snapshot = options.snapshot
    ? snapshotSchema.parse(options.snapshot)
    : { searches: {}, profiles: {} };
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();

  /** Memoizes a lookup for an hour; failed lookups are not kept. */
  function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && now() - hit.at < TTL) return hit.value as Promise<T>;
    const value = load();
    cache.set(key, { at: now(), value });
    value.catch(() => cache.delete(key));
    return value;
  }

  async function search(name: string): Promise<CompanyMatches> {
    const raw = await client.searchCompanies(name, 10);
    const found = raw.entities.filter((entity) => entity.entity_type === "Company").slice(0, 8);
    const details = await Promise.allSettled(
      found.map((entity) =>
        client.retrieve(entity.id, { properties: ["headquarters_address", "website"] }),
      ),
    );

    const seen = new Set<string>();
    const companies: CompanyMatch[] = [];
    found.forEach((entity, i) => {
      const detail = details[i]?.status === "fulfilled" ? details[i].value : undefined;
      const website = text(detail?.properties.website);
      const domain = website ? toDomain(website) : null;
      if (domain && seen.has(domain)) return;
      if (domain) seen.add(domain);
      companies.push({
        id: entity.id,
        name: entity.name,
        description: entity.description ? repair(entity.description) : null,
        hq: text(detail?.properties.headquarters_address),
        website: domain,
      });
    });
    return { companies };
  }

  async function profile(id: string): Promise<Profile> {
    const shape = await client.introspect(id);
    const has = (dir: "outgoing" | "incoming", rel: string) =>
      shape.relationships[dir].includes(rel);
    const pick = (dir: "outgoing" | "incoming", rels: Record<string, number>) =>
      Object.fromEntries(
        Object.entries(rels)
          .filter(([rel]) => has(dir, rel))
          .map(([rel, limit]) => [rel, { limit }]),
      );

    const company = await client.retrieve(id, {
      properties: wanted(shape, [
        "name",
        "description",
        "website",
        "headquarters_address",
        "founding_date",
        "funding_stage",
      ]),
      relationships: {
        outgoing: pick("outgoing", {
          PARTICIPATES_IN_FUNDING_ROUND: 50,
          OPERATES_IN_INDUSTRY: 10,
          PARTICIPATES_IN_EVENT: 50,
        }),
        incoming: pick("incoming", { FOUNDED: 20, IS_CEO_OF: 10, INVESTED_IN: 50 }),
      },
    });

    const out = company.relationships.outgoing;
    const inc = company.relationships.incoming;

    const issued = (out.PARTICIPATES_IN_FUNDING_ROUND ?? [])
      .filter((link) => (link.properties.role ?? "ISSUER") === "ISSUER")
      .slice(0, 12);
    const rounds = (
      await Promise.all(issued.map((link) => loadRound(link).catch(() => null)))
    ).filter((round): round is Round => round !== null);
    rounds.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

    const investors = await loadInvestors(rounds, inc.INVESTED_IN ?? []);
    const events = out.PARTICIPATES_IN_EVENT ?? [];
    const slush = events.find(
      (event) => event.id === SLUSH_2026 || /slush\s*2026/i.test(event.name),
    );

    return {
      id: company.id,
      name: text(company.properties.name) ?? company.name,
      description:
        text(company.properties.description) ??
        (company.description ? repair(company.description) : null),
      website: fact(company.properties.website),
      hq: fact(company.properties.headquarters_address),
      founded: fact(company.properties.founding_date),
      stage: fact(company.properties.funding_stage),
      industries: (out.OPERATES_IN_INDUSTRY ?? []).map((link) => ({
        value: link.name,
        sources: cites(link.properties.sources),
      })),
      rounds,
      investors,
      people: toPeople(inc.FOUNDED ?? [], inc.IS_CEO_OF ?? []),
      slush: { listed: Boolean(slush), sources: cites(slush?.properties.sources ?? []) },
    };
  }

  async function loadRound(link: CalaLink): Promise<Round> {
    const raw = await client.retrieve(link.id, {
      properties: [
        "round_label",
        "announcement_date",
        "event_date",
        "transaction_value",
        "transaction_value_units",
      ],
      relationships: { incoming: { PARTICIPATES_IN_FUNDING_ROUND: { limit: 50 } } },
    });
    const amount = raw.properties.transaction_value?.value;
    const backers: Backer[] = (raw.relationships.incoming.PARTICIPATES_IN_FUNDING_ROUND ?? [])
      .filter((p) => p.properties.role === "INVESTOR" && !isJunk(p))
      .map((p) => ({ id: p.id, name: p.name, lead: p.properties.is_lead === true ? true : null }));
    backers.sort((a, b) => Number(Boolean(b.lead)) - Number(Boolean(a.lead)));

    return {
      id: raw.id,
      label: text(raw.properties.round_label) ?? raw.name,
      date: text(raw.properties.announcement_date) ?? text(raw.properties.event_date),
      amount: typeof amount === "number" && amount > 0 ? amount : null,
      currency: text(raw.properties.transaction_value_units),
      backers,
      sources: cites(link.properties.sources),
    };
  }

  /** Merges round participants and INVESTED_IN links, then collapses records sharing a website. */
  async function loadInvestors(rounds: Round[], links: CalaLink[]): Promise<Investor[]> {
    const byId = new Map<string, { name: string; sources: CalaCite[] }>();
    for (const link of links) {
      if (isJunk(link)) continue;
      byId.set(link.id, { name: link.name, sources: link.properties.sources });
    }
    for (const round of rounds) {
      for (const backer of round.backers) {
        if (!byId.has(backer.id)) byId.set(backer.id, { name: backer.name, sources: [] });
      }
    }

    const ids = [...byId.keys()].slice(0, 30);
    const sites = await Promise.all(
      ids.map((id) =>
        client
          .retrieve(id, { properties: ["website"] })
          .then((raw) => text(raw.properties.website))
          .catch(() => null),
      ),
    );

    const groups = new Map<string, Investor>();
    ids.forEach((id, i) => {
      const entry = byId.get(id);
      if (!entry) return;
      const site = sites[i] ? toDomain(sites[i]) : null;
      const key = site ?? `id:${id}`;
      const led = rounds
        .filter((r) => r.backers.some((b) => b.id === id && b.lead))
        .map((r) => r.label);
      const fromRounds = rounds
        .filter((r) => r.backers.some((b) => b.id === id))
        .flatMap((r) => r.sources);
      const current = groups.get(key);
      if (current) {
        current.ids.push(id);
        current.led = [...new Set([...current.led, ...led])];
        current.sources = merge(current.sources, cites(entry.sources), fromRounds);
        return;
      }
      groups.set(key, {
        id,
        ids: [id],
        name: entry.name,
        website: site,
        led,
        sources: merge(cites(entry.sources), fromRounds),
      });
    });

    return [...groups.values()].sort((a, b) => b.led.length - a.led.length);
  }

  return {
    searchCompanies(name: string): Promise<CompanyMatches> {
      const key = name.trim().toLowerCase();
      const fixed = seed.searches[key];
      if (fixed) return Promise.resolve(fixed);
      return remember(`search:${key}`, () => search(name));
    },

    getProfile(id: string): Promise<Profile> {
      const fixed = seed.profiles[id];
      if (fixed) return Promise.resolve(fixed);
      return remember(`profile:${id}`, async () => {
        if (db) {
          const cached = await db.loadProfile(id).catch(() => null);
          if (cached && now() - cached.updatedAt.getTime() < TTL) {
            return cached.profile;
          }
        }
        const built = await profile(id);
        await db?.saveProfile(built).catch(() => undefined);
        return built;
      });
    },

    async saveUser(input: UpsertUser): Promise<User> {
      const fallback: User = {
        id: input.id,
        email: input.email,
        name: input.name ?? null,
        image: input.image ?? null,
        companyId: input.companyId ?? null,
        updatedAt: new Date(now()).toISOString(),
      };
      if (db) {
        return (await db.saveUser(input).catch(() => null)) ?? fallback;
      }
      return fallback;
    },
  };
}

function wanted(shape: CalaEntityIntrospectionResponse, names: string[]): string[] {
  return shape.properties.length ? names.filter((n) => shape.properties.includes(n)) : names;
}

function isJunk(link: CalaLink): boolean {
  return link.entity_type === "Person" || JUNK.test(link.name.trim());
}

/** Fixes UTF-8 text that was decoded as Latin-1 upstream (e.g. "whatâ\u0080\u0099s"). */
export function repair(value: string): string {
  const latin = [...value].every((char) => char.charCodeAt(0) <= 0xff);
  if (!latin || !/[\u00c2-\u00f4][\u0080-\u00bf]/.test(value)) {
    return value;
  }
  const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
  const fixed = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return fixed.includes("\ufffd") ? value : fixed;
}

function text(prop: CalaProperty | null | undefined): string | null {
  const value = prop?.value;
  if (typeof value === "string" && value.trim()) return repair(value.trim());
  if (typeof value === "number") return String(value);
  return null;
}

function fact(prop: CalaProperty | null | undefined): TextFact | null {
  const value = text(prop);
  return value ? { value, sources: cites(prop?.sources ?? []) } : null;
}

function toRank(raw: string | null | undefined): Rank {
  const upper = raw?.toUpperCase();
  return RANKS.find((rank) => rank === upper) ?? "OTHER";
}

/** Normalizes Cala sources: one per document, strongest rank first. */
export function cites(raw: CalaCite[]): Cite[] {
  const seen = new Set<string>();
  const out: Cite[] = [];
  for (const source of raw) {
    const url = source.document?.startsWith("http") ? source.document : null;
    const key = url ?? source.name ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: source.name ?? (url ? toDomain(url) : "Unknown"),
      url,
      date: source.date ?? null,
      rank: toRank(source.source_rank),
    });
  }
  return out.sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));
}

function merge(...lists: Cite[][]): Cite[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((cite) => {
      const key = cite.url ?? cite.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));
}

export function toDomain(site: string): string {
  return site
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function toPeople(founders: CalaLink[], ceos: CalaLink[]): Person[] {
  const people = new Map<string, Person>();
  const add = (link: CalaLink, role: "FOUNDER" | "CEO") => {
    const current = people.get(link.id);
    if (current) {
      if (!current.roles.includes(role)) current.roles.push(role);
      current.sources = merge(current.sources, cites(link.properties.sources));
      return;
    }
    people.set(link.id, {
      id: link.id,
      name: link.name,
      roles: [role],
      sources: cites(link.properties.sources),
    });
  };
  for (const link of ceos) add(link, "CEO");
  for (const link of founders) add(link, "FOUNDER");
  return [...people.values()];
}
