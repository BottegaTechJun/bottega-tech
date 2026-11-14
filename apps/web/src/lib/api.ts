import { apiErrorSchema, type HealthResponse, healthResponseSchema } from "@repo/shared";
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

/** Calls our API and validates the response body against a `@repo/shared` schema. */
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

/** `RequestInit` for a JSON POST, e.g. `request(schema, "/api/x", postJson({ input }))`. */
export const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** One typed function per endpoint. Schemas come from `@repo/shared`. */
export const api = {
  health: (): Promise<HealthResponse> => request(healthResponseSchema, "/health"),
};
