import {
  apiErrorSchema,
  type CompanyMatches,
  companyMatchesSchema,
  type Profile,
  profileSchema,
} from "@repo/shared";
import type { z } from "zod";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TIMEOUT = 30_000;

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
  signal?: AbortSignal,
): Promise<z.infer<Schema>> {
  const timeout = AbortSignal.timeout(TIMEOUT);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (timeout.aborted)
      throw new ApiError("timeout", "Public company data is taking too long. Try again.");
    throw new ApiError("network_error", "Could not reach the Bottega API");
  }

  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiError(parsed.data.error.code, publicMessage(parsed.data.error.message))
      : new ApiError("unknown_error", `Request failed (${res.status})`);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("invalid_response", "The API returned an unexpected response");
  }
  return parsed.data;
}

function publicMessage(message: string): string {
  return message.replace(/\bCala\b/gi, "public data service");
}

const profiles = new Map<string, Promise<Profile>>();

export const api = {
  companies: (name: string, signal?: AbortSignal): Promise<CompanyMatches> =>
    request(
      companyMatchesSchema,
      `/api/onboarding/companies?${new URLSearchParams({ name })}`,
      signal,
    ),

  /** Memoized so hovering a result can warm the profile before the click. */
  profile(id: string): Promise<Profile> {
    const hit = profiles.get(id);
    if (hit) return hit;
    const next = request(profileSchema, `/api/onboarding/companies/${encodeURIComponent(id)}`);
    profiles.set(id, next);
    next.catch(() => profiles.delete(id));
    return next;
  },
};
