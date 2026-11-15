import {
  type MatchupEvent,
  type SearchSession,
  type SearchSessionInput,
  type SearchSessionSummary,
  searchSessionSchema,
} from "@repo/shared";
import { z } from "zod";

/** Searches the API could not save, kept in this browser instead. Newest first. */
const KEY = "bottega.searches.v1";
const MAX = 10;

const listSchema = z.array(z.unknown());

function key(userId: string): string {
  return `${KEY}:${userId}`;
}

function read(userId: string): SearchSession[] {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return [];
    const list = listSchema.safeParse(JSON.parse(raw));
    if (!list.success) return [];
    return list.data.flatMap((item) => {
      const parsed = searchSessionSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return [];
  }
}

/** Writes the list, dropping the oldest entries while storage is full. */
function write(userId: string, list: SearchSession[]): boolean {
  let rest = list.slice(0, MAX);
  while (rest.length) {
    try {
      localStorage.setItem(key(userId), JSON.stringify(rest));
      return true;
    } catch {
      rest = rest.slice(0, -1);
    }
  }
  try {
    localStorage.removeItem(key(userId));
  } catch {
    // Storage is not available at all.
  }
  return false;
}

/** A finished stream as a search session, in the same shape the API saves. */
export function toSession(
  id: string,
  input: SearchSessionInput,
  events: MatchupEvent[],
  parentId: string | null,
): SearchSession {
  const complete = events.some((e) => e.type === "done") && !events.some((e) => e.type === "error");
  const savedAt = new Date().toISOString();
  return {
    id,
    input,
    status: complete ? "complete" : "incomplete",
    savedAt,
    parentId,
    replay: { complete, savedAt, events },
  };
}

function summarize(session: SearchSession): SearchSessionSummary {
  const { replay, ...rest } = session;
  const done = replay.events.findLast((e) => e.type === "done");
  const asked = replay.events.find((e) => e.type === "follow-up");
  return {
    ...rest,
    picks: done?.type === "done" ? done.graph.investors.length : 0,
    question: asked?.type === "follow-up" ? asked.question : null,
  };
}

export const local = {
  /** Keeps a search the API did not save. Returns false when storage is unavailable. */
  keep(userId: string, session: SearchSession): boolean {
    const rest = read(userId).filter((s) => s.id !== session.id);
    return write(userId, [session, ...rest]);
  },

  get(userId: string, id: string): SearchSession | null {
    return read(userId).find((s) => s.id === id) ?? null;
  },

  ids(userId: string): string[] {
    return read(userId).map((s) => s.id);
  },

  remove(userId: string, id: string): void {
    const list = read(userId);
    const rest = list.filter((s) => s.id !== id);
    if (rest.length !== list.length) write(userId, rest);
  },

  /** The API's list plus local searches it does not have, newest first. */
  merge(userId: string, saved: SearchSessionSummary[]): SearchSessionSummary[] {
    const known = new Set(saved.map((s) => s.id));
    const extra = read(userId)
      .filter((s) => !known.has(s.id))
      .map(summarize);
    return [...saved, ...extra].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },
};
