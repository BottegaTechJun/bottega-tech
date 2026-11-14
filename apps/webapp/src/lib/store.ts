"use client";

import { type CompanyMatch, companyMatchSchema } from "@repo/shared";
import { useSession } from "next-auth/react";
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

const KEY = "bottega.onboarding.v2";

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

function storageKey(userId: string | null): string {
  return `${KEY}:${userId ?? "anonymous"}`;
}

function read(userId: string | null): Progress {
  try {
    const raw = localStorage.getItem(storageKey(userId));
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

function hasDraft(state: Progress): boolean {
  return Boolean(
    state.company ||
      state.confirmed ||
      state.prefsDone ||
      Object.values(state.prefs).some((answers) => answers.length > 0),
  );
}

/** Progress state synced to localStorage and across tabs; `ready` is false until loaded. */
export function useProgress() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const [state, set] = useState<Progress>(fresh);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    const next = read(userId);
    // Preserve an anonymous onboarding draft when the founder signs in to save a search.
    if (userId && !hasDraft(next)) {
      const anonymous = read(null);
      if (hasDraft(anonymous)) {
        try {
          localStorage.setItem(storageKey(userId), JSON.stringify(anonymous));
        } catch {
          // Private mode or full storage: keep the migrated draft in memory.
        }
        set(anonymous);
      } else {
        set(next);
      }
    } else {
      set(next);
    }
    setReady(true);
    const key = storageKey(userId);
    const sync = (e: StorageEvent) => e.key === key && set(read(userId));
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [status, userId]);

  const setState = useCallback(
    (next: Progress | ((s: Progress) => Progress)) => {
      set((s) => {
        const value = typeof next === "function" ? next(s) : next;
        try {
          localStorage.setItem(storageKey(userId), JSON.stringify(value));
        } catch {
          // Private mode or full storage: keep going in memory.
        }
        return value;
      });
    },
    [userId],
  );

  return { state, setState, ready };
}
