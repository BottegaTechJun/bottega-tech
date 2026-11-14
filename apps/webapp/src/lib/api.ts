import {
  apiErrorSchema,
  brandsResponseSchema,
  type CompanyMatches,
  companyMatchesSchema,
  type FounderPreferencesState,
  founderPreferencesStateSchema,
  type MatchupReplay,
  matchupReplaySchema,
  type Profile,
  type ProfileInput,
  type ProfileSummary,
  profileListSchema,
  profileSchema,
  type RunSummary,
  runListSchema,
  type SavedProfile,
  savedProfileSchema,
  type UpsertFounderPreferences,
} from "@repo/shared";
import { z } from "zod";

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

interface Options {
  signal?: AbortSignal;
  method?: "POST" | "PUT" | "DELETE";
  body?: unknown;
}

async function request<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
  { signal, method, body: payload }: Options = {},
): Promise<z.infer<Schema>> {
  const timeout = AbortSignal.timeout(TIMEOUT);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (timeout.aborted) throw new ApiError("timeout", "Cala is taking too long. Try again.");
    throw new ApiError("network_error", "Could not reach the Bottega API");
  }

  const body: unknown = res.status === 204 ? null : await res.json().catch(() => undefined);
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

const profiles = new Map<string, Promise<Profile>>();

export const api = {
  /** Websites Cala knows for these entity ids, for logos. */
  brands: async (ids: string[], signal?: AbortSignal): Promise<Record<string, string>> =>
    (
      await request(brandsResponseSchema, "/api/brands", {
        method: "POST",
        body: { ids: ids.slice(0, 100) },
        ...(signal ? { signal } : {}),
      })
    ).sites,

  companies: (name: string, signal?: AbortSignal): Promise<CompanyMatches> =>
    request(companyMatchesSchema, `/api/onboarding/companies?${new URLSearchParams({ name })}`, {
      signal,
    }),

  /** Memoized so hovering a result can warm the profile before the click. */
  profile(id: string): Promise<Profile> {
    const hit = profiles.get(id);
    if (hit) return hit;
    const next = request(profileSchema, `/api/onboarding/companies/${encodeURIComponent(id)}`);
    profiles.set(id, next);
    next.catch(() => profiles.delete(id));
    return next;
  },

  profiles: async (): Promise<ProfileSummary[]> =>
    (await request(profileListSchema, "/api/profiles")).profiles,

  saved: (id: string): Promise<SavedProfile> =>
    request(savedProfileSchema, `/api/profiles/${encodeURIComponent(id)}`),

  /** Creates a profile, or updates it when `id` is given. */
  save: (input: ProfileInput, id?: string | null): Promise<SavedProfile> =>
    request(savedProfileSchema, id ? `/api/profiles/${encodeURIComponent(id)}` : "/api/profiles", {
      method: id ? "PUT" : "POST",
      body: input,
    }),

  remove: async (id: string): Promise<void> => {
    await request(z.unknown(), `/api/profiles/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  runs: async (id: string): Promise<RunSummary[]> =>
    (await request(runListSchema, `/api/profiles/${encodeURIComponent(id)}/runs`)).runs,

  run: (id: string, run: string): Promise<MatchupReplay> =>
    request(
      matchupReplaySchema,
      `/api/profiles/${encodeURIComponent(id)}/runs/${encodeURIComponent(run)}`,
    ),

  getPreferences(id: string): Promise<FounderPreferencesState> {
    return request(
      founderPreferencesStateSchema,
      `/api/onboarding/companies/${encodeURIComponent(id)}/preferences`,
    );
  },

  savePreferences(id: string, payload: UpsertFounderPreferences): Promise<FounderPreferencesState> {
    return request(
      founderPreferencesStateSchema,
      `/api/onboarding/companies/${encodeURIComponent(id)}/preferences`,
      { method: "PUT", body: payload },
    );
  },
};

/** Tells every mounted profile list to reload, e.g. after a save or delete. */
export const PROFILES_CHANGED = "bottega:profiles";
export const announce = () => window.dispatchEvent(new Event(PROFILES_CHANGED));
