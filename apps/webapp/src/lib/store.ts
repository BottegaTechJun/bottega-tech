"use client";

import { type CompanyMatch, companyMatchSchema } from "@repo/shared";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { emptyPrefs, type Prefs } from "./prefs";

/** Everything the founder has told us so far. Kept in localStorage, no account needed. */
export interface Progress {
  company: CompanyMatch | null;
  confirmed: boolean;
  prefs: Prefs;
  prefsDone: boolean;
}

const KEY = "bottega.onboarding.v1";

export const fresh: Progress = {
  company: null,
  confirmed: false,
  prefs: emptyPrefs,
  prefsDone: false,
};

// Bad or stale fields fall back to their defaults instead of crashing the page.
const list = z.array(z.string()).catch([]);
const progressSchema = z.object({
  company: companyMatchSchema.nullable().catch(null),
  confirmed: z.boolean().catch(false),
  prefs: z
    .object({ round: list, size: list, geo: list, lead: list, sector: list, timing: list })
    .catch(emptyPrefs),
  prefsDone: z.boolean().catch(false),
});

function read(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const parsed = progressSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return fresh;
    const state = parsed.data;
    // Later steps only count when the earlier ones still hold.
    const confirmed = Boolean(state.company) && state.confirmed;
    return { ...state, confirmed, prefsDone: confirmed && state.prefsDone };
  } catch {
    return fresh;
  }
}

/** Progress state synced to localStorage and across tabs; `ready` is false until loaded. */
export function useProgress() {
  const [state, set] = useState<Progress>(fresh);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    set(read());
    setReady(true);
    const sync = (e: StorageEvent) => e.key === KEY && set(read());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const setState = useCallback((next: Progress | ((s: Progress) => Progress)) => {
    set((s) => {
      const value = typeof next === "function" ? next(s) : next;
      try {
        localStorage.setItem(KEY, JSON.stringify(value));
      } catch {
        // Private mode or full storage: keep going in memory.
      }
      return value;
    });
  }, []);

  return { state, setState, ready };
}
