import { companyMatchesSchema, profileSchema } from "@repo/shared";
import { z } from "zod";

/** Precomputed results (fixtures/demo.json): searches keyed by lowercased name, profiles by id. */
export const snapshotSchema = z.object({
  searches: z.record(z.string(), companyMatchesSchema),
  profiles: z.record(z.string(), profileSchema),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

/*
 * Narrower views of Cala's entity responses, for the fields onboarding reads.
 * Tolerant like the client schemas: unknown fields pass through.
 */

/** A source behind one fact, as Cala returns it on properties and relationships. */
export const citeSchema = z.looseObject({
  name: z.string().nullish(),
  document: z.string().nullish(),
  date: z.string().nullish(),
  source_rank: z.string().nullish(),
});
export type CalaCite = z.infer<typeof citeSchema>;

export const propertySchema = z.looseObject({
  value: z.unknown(),
  sources: z.array(citeSchema).default([]),
});
export type CalaProperty = z.infer<typeof propertySchema>;

export const linkSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  entity_type: z.string(),
  properties: z
    .looseObject({
      role: z.string().nullish(),
      is_lead: z.boolean().nullish(),
      sources: z.array(citeSchema).default([]),
    })
    .default({ sources: [] }),
});
export type CalaLink = z.infer<typeof linkSchema>;

const linksSchema = z.record(z.string(), z.array(linkSchema)).default({});

/** POST /v1/entities/{id} with a projection: sourced properties and relationships */
export const retrievalSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  entity_type: z.string(),
  description: z.string().nullish(),
  properties: z.record(z.string(), propertySchema.nullable()).default({}),
  relationships: z
    .looseObject({ outgoing: linksSchema, incoming: linksSchema })
    .default({ outgoing: {}, incoming: {} }),
});
export type CalaRetrieval = z.infer<typeof retrievalSchema>;
