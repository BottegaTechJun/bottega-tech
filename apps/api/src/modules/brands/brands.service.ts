import type { BrandsResponse } from "@repo/shared";
import type { CalaClient } from "../cala/cala.client";
import { toDomain } from "../onboarding/onboarding.service";
import { websiteSchema } from "./brands.schemas";

const PARALLEL = 6;

/** Websites for entity ids, straight from Cala's entity data. Never runs the agent. */
export function createBrandsService(cala: Pick<CalaClient, "entity_retrieval">) {
  // Websites rarely change; a process-wide memo spares repeat lookups.
  const known = new Map<string, string | null>();

  async function site(id: string): Promise<string | null> {
    if (known.has(id)) return known.get(id) ?? null;
    const entity = await cala.entity_retrieval(id, { properties: ["website"] }).catch(() => null);
    const value = websiteSchema.safeParse(entity).data?.properties.website?.value;
    const domain = typeof value === "string" && value.trim() ? toDomain(value) : null;
    known.set(id, domain);
    return domain;
  }

  return {
    async sites(ids: string[]): Promise<BrandsResponse> {
      const queue = [...new Set(ids)];
      const out: Record<string, string> = {};
      const worker = async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
          const domain = await site(id);
          if (domain) out[id] = domain;
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
      return { sites: out };
    },
  };
}
export type BrandsService = ReturnType<typeof createBrandsService>;
