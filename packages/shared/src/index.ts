import { z } from "zod";

/**
 * Request/response contracts between apps/web and apps/api.
 * The API validates requests with these schemas; the web client validates responses.
 */

// ---------- Requests ----------

export const searchRequestSchema = z.object({
  input: z.string({ error: "input is required" }).trim().min(1, "input is required").max(2000),
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const queryRequestSchema = z.object({
  input: z.string({ error: "input is required" }).trim().min(1, "input is required").max(2000),
});
export type QueryRequest = z.infer<typeof queryRequestSchema>;

export const entitiesQuerySchema = z.object({
  name: z.string({ error: "name is required" }).trim().min(1, "name is required").max(100),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type EntitiesQuery = z.infer<typeof entitiesQuerySchema>;

export const entityParamsSchema = z.object({
  id: z.uuid("id must be a UUID"),
});
export type EntityParams = z.infer<typeof entityParamsSchema>;

// ---------- Responses ----------

export const entityMentionSchema = z.object({
  id: z.string(),
  name: z.string(),
  entityType: z.string(),
  mentions: z.array(z.string()),
});
export type EntityMention = z.infer<typeof entityMentionSchema>;

export const sourceSchema = z.object({
  /** Publisher, e.g. "Sifted" */
  name: z.string(),
  url: z.string(),
  /** The specific document the fact came from */
  document: z.object({ name: z.string(), url: z.string() }),
});
export type Source = z.infer<typeof sourceSchema>;

export const searchResponseSchema = z.object({
  /** Markdown answer */
  answer: z.string(),
  sources: z.array(sourceSchema),
  entities: z.array(entityMentionSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const queryResponseSchema = z.object({
  /** Free-form rows; keys depend on the query */
  rows: z.array(z.record(z.string(), z.unknown())),
  entities: z.array(entityMentionSchema),
});
export type QueryResponse = z.infer<typeof queryResponseSchema>;

export const entitySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  entityType: z.string(),
  description: z.string().nullable(),
});
export type EntitySummary = z.infer<typeof entitySummarySchema>;

export const entitiesResponseSchema = z.object({
  entities: z.array(entitySummarySchema),
});
export type EntitiesResponse = z.infer<typeof entitiesResponseSchema>;

export const entityDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  entityType: z.string(),
  properties: z.record(z.string(), z.unknown()),
  relationships: z.object({
    outgoing: z.record(z.string(), z.unknown()),
    incoming: z.record(z.string(), z.unknown()),
  }),
  numericalObservations: z.array(z.unknown()),
});
export type EntityDetail = z.infer<typeof entityDetailSchema>;

// ---------- Errors ----------

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
