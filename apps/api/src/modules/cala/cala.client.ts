import type { z } from "zod";
import { HttpError } from "../../lib/http-error";
import {
  calaEntityResponseSchema,
  calaEntitySearchResponseSchema,
  calaErrorResponseSchema,
  calaQueryResponseSchema,
  calaSearchResponseSchema,
} from "./cala.schemas";

export interface CalaClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Per-attempt timeout. Knowledge search can take a while. */
  timeoutMs?: number;
  /** Extra attempts after a 429. */
  maxRetries?: number;
  /** First backoff delay; doubles on every retry. */
  retryBaseMs?: number;
  /** Injectable for tests. */
  fetch?: (url: URL, init: RequestInit) => Promise<Response>;
}

interface RequestOptions {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

export type CalaClient = ReturnType<typeof createCalaClient>;

/** Thin typed client for the Cala HTTP API. No business logic lives here. */
export function createCalaClient(options: CalaClientOptions) {
  const {
    apiKey,
    baseUrl = "https://api.cala.ai",
    timeoutMs = 60_000,
    maxRetries = 2,
    retryBaseMs = 500,
    fetch: doFetch = (url, init) => fetch(url, init),
  } = options;

  async function request<Schema extends z.ZodType>(
    schema: Schema,
    { method, path, query, body }: RequestOptions,
  ): Promise<z.infer<Schema>> {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(url, {
          method,
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new HttpError(504, "upstream_timeout", "The Cala API took too long to respond");
        }
        throw new HttpError(502, "upstream_unreachable", "Could not reach the Cala API");
      }

      if (res.status === 429 && attempt < maxRetries) {
        await Bun.sleep(retryDelayMs(res, retryBaseMs, attempt));
        continue;
      }
      if (!res.ok) {
        throw await toHttpError(res);
      }

      const parsed = schema.safeParse(await res.json().catch(() => undefined));
      if (!parsed.success) {
        throw new HttpError(
          502,
          "upstream_invalid_response",
          "The Cala API returned an unexpected response",
        );
      }
      return parsed.data;
    }
  }

  return {
    search: (input: string) =>
      request(calaSearchResponseSchema, {
        method: "POST",
        path: "/v1/knowledge/search",
        body: { input, explainability: true, return_entities: true },
      }),

    query: (input: string) =>
      request(calaQueryResponseSchema, {
        method: "POST",
        path: "/v1/knowledge/query",
        body: { input, return_entities: true },
      }),

    searchEntities: (name: string, limit: number) =>
      request(calaEntitySearchResponseSchema, {
        method: "GET",
        path: "/v1/entities",
        query: { name, limit: String(limit) },
      }),

    getEntity: (id: string) =>
      request(calaEntityResponseSchema, {
        method: "POST",
        path: `/v1/entities/${encodeURIComponent(id)}`,
        body: {},
      }),
  };
}

/** Honors `Retry-After` (seconds) when present, otherwise exponential backoff. */
function retryDelayMs(res: Response, baseMs: number, attempt: number): number {
  const retryAfter = Number(res.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 10_000);
  }
  return baseMs * 2 ** attempt;
}

/** Maps a non-2xx Cala response to our error shape. */
async function toHttpError(res: Response): Promise<HttpError> {
  const parsed = calaErrorResponseSchema.safeParse(await res.json().catch(() => undefined));
  const calaError = parsed.success ? parsed.data.error : undefined;

  if (res.status === 429) {
    return new HttpError(429, "rate_limited", "Cala rate limit reached, try again shortly");
  }
  if (res.status === 401 || res.status === 403) {
    return new HttpError(502, "upstream_auth_error", "The Cala API rejected the API key");
  }
  if (res.status === 404 || calaError?.error_type === "entity_not_found_error") {
    return new HttpError(404, "not_found", calaError?.message ?? "Not found");
  }
  if (res.status === 400 || res.status === 422) {
    return new HttpError(400, "bad_request", calaError?.message ?? "Cala rejected the request");
  }
  return new HttpError(
    502,
    "upstream_error",
    calaError?.message ?? `Cala API error (${res.status})`,
  );
}
