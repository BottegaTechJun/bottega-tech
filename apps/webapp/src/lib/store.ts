"use client";

import type { CompanyMatch } from "@repo/shared";
import { useEffect, useState } from "react";
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

function read(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...fresh, ...(JSON.parse(raw) as Partial<Progress>) } : fresh;
  } catch {
    return fresh;
  }
}

/** Progress state synced to localStorage; `ready` is false until it has been loaded. */
export function useProgress() {
  const [state, setState] = useState<Progress>(fresh);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(read());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(KEY, JSON.stringify(state));
  }, [state, ready]);

  return { state, setState, ready };
}
