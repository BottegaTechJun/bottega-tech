import type { MatchupEvent } from "@repo/shared";

/** One background run: its events so far, and readers waiting for more. */
export interface Live {
  userId: string;
  events: MatchupEvent[];
  finished: boolean;
  stop: AbortController;
  readers: Set<() => void>;
}

export type Work = (emit: (event: MatchupEvent) => void, signal: AbortSignal) => Promise<void>;

// Finished runs stay readable this long, so a late reconnect still gets the end.
const KEEP_MS = 10 * 60_000;

/** In-memory registry of runs that outlive their HTTP connections. */
export function createRuns(keep = KEEP_MS) {
  const runs = new Map<string, Live>();

  function start(userId: string, work: Work): string {
    const id = crypto.randomUUID();
    const live: Live = {
      userId,
      events: [],
      finished: false,
      stop: new AbortController(),
      readers: new Set(),
    };
    runs.set(id, live);
    const wake = () => {
      for (const read of live.readers) read();
    };
    work((event) => {
      live.events.push(event);
      wake();
    }, live.stop.signal)
      .catch((err) => console.error("Matchup run failed:", err))
      .finally(() => {
        live.finished = true;
        wake();
        setTimeout(() => runs.delete(id), keep);
      });
    return id;
  }

  /** The run, only when `userId` owns it. */
  function get(id: string, userId: string): Live | null {
    const live = runs.get(id);
    return live?.userId === userId ? live : null;
  }

  return { start, get };
}

export type Runs = ReturnType<typeof createRuns>;
