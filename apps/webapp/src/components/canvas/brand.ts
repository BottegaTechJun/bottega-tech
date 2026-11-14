import type { Entity, Profile } from "@repo/shared";
import type { Run } from "@/lib/matchup";

const BRANDED = new Set(["company", "investor", "event"]);
const SUFFIX = ["", "vc", "ventures", "capital", "hq"];

function words(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
}

/** "www.ventechvc.com" → "ventechvc"; the label before the top-level domain. */
function stem(host: string): string {
  const parts = host.split(".");
  return parts[parts.length - 2] ?? host;
}

/** A source host belongs to an entity only when its name is the domain, e.g. Vendep → vendep.com. */
function owns(entity: Entity, host: string): boolean {
  const list = words(entity.name);
  const first = list[0];
  if (!first || first.length < 4) return false;
  const label = stem(host);
  return label === list.join("") || SUFFIX.some((s) => label === first + s);
}

function host(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Domain per entity id, only from grounded data: Cala websites (`sites`), profile websites and
 * matching source hosts. A funding round borrows the logo of the company that raised it.
 */
export function domains(
  run: Run,
  company: { id: string; website: string | null },
  facts: Profile | null,
  sites: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const hosts = new Set<string>();
  const cites = [
    ...Object.values(run.facts).flatMap((f) => f.sources),
    ...(run.graph?.connections ?? []).flatMap((c) => c.evidence),
  ];
  for (const cite of cites) {
    const h = cite.url ? host(cite.url) : null;
    if (h) hosts.add(h);
  }
  // Shortest host first, so vendep.com beats blog.vendep.com.
  const sorted = [...hosts].sort((a, b) => a.length - b.length);
  for (const entity of Object.values(run.entities)) {
    if (!BRANDED.has(entity.role)) continue;
    const hit = sorted.find((h) => owns(entity, h));
    if (hit) out[entity.id] = hit;
  }
  for (const investor of facts?.investors ?? []) {
    if (!investor.website) continue;
    for (const id of investor.ids) out[id] = investor.website;
  }
  Object.assign(out, sites);
  if (company.website) out[company.id] = company.website;
  for (const fact of Object.values(run.facts)) {
    const site = out[fact.from];
    if (fact.role === "ISSUER" && site && run.entities[fact.to]?.role === "round") {
      out[fact.to] = site;
    }
  }
  return out;
}
