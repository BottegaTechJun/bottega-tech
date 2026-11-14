import { z } from "zod";

/**
 * Schemas for Cala's raw responses (https://api.cala.ai/openapi.json).
 * Deliberately tolerant: `z.looseObject` is zod 4's `.passthrough()`, so unknown
 * fields are kept and only the fields we actually read are required.
 */

const calaEntityMentionSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  entity_type: z.string(),
  mentions: z.array(z.string()).default([]),
});

const calaLinkSchema = z.looseObject({
  name: z.string(),
  url: z.string(),
});

const calaOriginSchema = z.looseObject({
  source: calaLinkSchema,
  document: calaLinkSchema,
  breadcrumb: z.array(z.string()).default([]),
});

const calaKnowBitSchema = z.looseObject({
  id: z.string(),
  content: z.string(),
  origins: z.array(calaOriginSchema).default([]),
});

/** POST /v1/knowledge/search */
export const calaSearchResponseSchema = z.looseObject({
  content: z.string(),
  explainability: z
    .array(z.looseObject({ content: z.string(), references: z.array(z.string()).default([]) }))
    .nullish(),
  context: z.array(calaKnowBitSchema).default([]),
  entities: z.array(calaEntityMentionSchema).nullish(),
});
export type CalaSearchResponse = z.infer<typeof calaSearchResponseSchema>;

/** POST /v1/knowledge/query — rows are free-form */
export const calaQueryResponseSchema = z.looseObject({
  results: z.array(z.record(z.string(), z.unknown())).default([]),
  entities: z.array(calaEntityMentionSchema).nullish(),
});
export type CalaQueryResponse = z.infer<typeof calaQueryResponseSchema>;

/** GET /v1/entities */
export const calaEntitySearchResponseSchema = z.looseObject({
  entities: z
    .array(
      z.looseObject({
        id: z.string(),
        name: z.string(),
        entity_type: z.string(),
        description: z.string().nullish(),
      }),
    )
    .default([]),
});
export type CalaEntitySearchResponse = z.infer<typeof calaEntitySearchResponseSchema>;

/** POST /v1/entities/{id} */
export const calaEntityResponseSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  entity_type: z.string(),
  properties: z.record(z.string(), z.unknown()).default({}),
  relationships: z
    .looseObject({
      outgoing: z.record(z.string(), z.unknown()).default({}),
      incoming: z.record(z.string(), z.unknown()).default({}),
    })
    .default({ outgoing: {}, incoming: {} }),
  numerical_observations: z.array(z.unknown()).nullish(),
});
export type CalaEntityResponse = z.infer<typeof calaEntityResponseSchema>;

/** 422 body: {response_type: "ERROR", error: {error_type, message}} */
export const calaErrorResponseSchema = z.looseObject({
  error: z.looseObject({
    error_type: z.string(),
    message: z.string(),
  }),
});
