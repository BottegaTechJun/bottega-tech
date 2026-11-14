import {
  apiErrorSchema,
  type EntitiesResponse,
  type EntityDetail,
  entitiesResponseSchema,
  entityDetailSchema,
  type QueryResponse,
  queryResponseSchema,
  type SearchResponse,
  searchResponseSchema,
} from "@repo/shared";
import type { z } from "zod";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Any failure talking to our API: network, an error response, or an unexpected body. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
  init?: RequestInit,
): Promise<z.infer<Schema>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError("network_error", `Could not reach the API at ${API_URL}`);
  }

  const body: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiError(parsed.data.error.code, parsed.data.error.message)
      : new ApiError("unknown_error", `Request failed (${res.status})`);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("invalid_response", "The API returned an unexpected response");
  }
  return parsed.data;
}

const post = (input: string): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input }),
});

export const api = {
  search: (input: string): Promise<SearchResponse> =>
    request(searchResponseSchema, "/api/search", post(input)),

  query: (input: string): Promise<QueryResponse> =>
    request(queryResponseSchema, "/api/query", post(input)),

  entities: (name: string, limit = 20): Promise<EntitiesResponse> =>
    request(
      entitiesResponseSchema,
      `/api/entities?${new URLSearchParams({ name, limit: String(limit) })}`,
    ),

  entity: (id: string): Promise<EntityDetail> =>
    request(entityDetailSchema, `/api/entities/${encodeURIComponent(id)}`),
};
