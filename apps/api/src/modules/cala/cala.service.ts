import type {
  EntitiesResponse,
  EntityDetail,
  EntityMention,
  QueryResponse,
  SearchResponse,
  Source,
} from "@repo/shared";
import type { CalaClient } from "./cala.client";
import type { CalaSearchResponse } from "./cala.schemas";

export type CalaService = ReturnType<typeof createCalaService>;

/** Calls the Cala client and normalizes its responses into our shared contracts. */
export function createCalaService(client: CalaClient) {
  return {
    async search(input: string): Promise<SearchResponse> {
      const raw = await client.search(input);
      return {
        answer: raw.content,
        sources: toSources(raw.context),
        entities: toEntityMentions(raw.entities),
      };
    },

    async query(input: string): Promise<QueryResponse> {
      const raw = await client.query(input);
      return {
        rows: raw.results,
        entities: toEntityMentions(raw.entities),
      };
    },

    async searchEntities(name: string, limit: number): Promise<EntitiesResponse> {
      const raw = await client.searchEntities(name, limit);
      return {
        entities: raw.entities.map((entity) => ({
          id: entity.id,
          name: entity.name,
          entityType: entity.entity_type,
          description: entity.description ?? null,
        })),
      };
    },

    async getEntity(id: string): Promise<EntityDetail> {
      const raw = await client.getEntity(id);
      return {
        id: raw.id,
        name: raw.name,
        entityType: raw.entity_type,
        properties: raw.properties,
        relationships: {
          outgoing: raw.relationships.outgoing,
          incoming: raw.relationships.incoming,
        },
        numericalObservations: raw.numerical_observations ?? [],
      };
    },
  };
}

/** Flattens context → origins into a list of sources, one per document. */
function toSources(context: CalaSearchResponse["context"]): Source[] {
  const byDocument = new Map<string, Source>();
  for (const fact of context) {
    for (const origin of fact.origins) {
      if (!byDocument.has(origin.document.url)) {
        byDocument.set(origin.document.url, {
          name: origin.source.name,
          url: origin.source.url,
          document: { name: origin.document.name, url: origin.document.url },
        });
      }
    }
  }
  return [...byDocument.values()];
}

function toEntityMentions(entities: CalaSearchResponse["entities"]): EntityMention[] {
  return (entities ?? []).map((entity) => ({
    id: entity.id,
    name: entity.name,
    entityType: entity.entity_type,
    mentions: entity.mentions,
  }));
}
