import type {
  MatchupReplay,
  SearchSession,
  SearchSessionInput,
  SearchSessionStatus,
  SearchSessionSummary,
} from "@repo/shared";
import type { Database } from "../../lib/db";

export interface SearchSessionStore {
  save(
    userId: string,
    id: string,
    input: SearchSessionInput,
    replay: MatchupReplay,
    parentId: string | null,
  ): Promise<void>;
  list(userId: string): Promise<SearchSessionSummary[]>;
  load(userId: string, id: string): Promise<SearchSession | null>;
  remove(userId: string, id: string): Promise<boolean>;
}

function statusFor(replay: MatchupReplay): SearchSessionStatus {
  if (replay.complete) return "complete";
  return replay.events.some((event) => event.type === "error") ? "incomplete" : "running";
}

function summary(session: SearchSession): SearchSessionSummary {
  const done = session.replay.events.find((event) => event.type === "done");
  const followUp = session.replay.events.find((event) => event.type === "follow-up");
  return {
    id: session.id,
    input: session.input,
    status: session.status,
    savedAt: session.savedAt,
    parentId: session.parentId,
    picks: done?.type === "done" ? done.graph.investors.length : 0,
    question: followUp?.type === "follow-up" ? followUp.question : null,
  };
}

/** Database-backed sessions with an isolated in-memory fallback for local demos/tests. */
export function createSearchSessionStore(db: Database | null): SearchSessionStore {
  const memory = new Map<string, Map<string, SearchSession>>();
  const bucket = (userId: string) => {
    const existing = memory.get(userId);
    if (existing) return existing;
    const created = new Map<string, SearchSession>();
    memory.set(userId, created);
    return created;
  };

  return {
    async save(userId, id, input, replay, parentId) {
      const session: SearchSession = {
        id,
        input,
        status: statusFor(replay),
        savedAt: replay.savedAt,
        parentId,
        replay,
      };
      bucket(userId).set(id, session);
      if (db?.saveSearchSession) await db.saveSearchSession(userId, id, input, replay, parentId);
    },

    async list(userId) {
      if (db?.listSearchSessions) return db.listSearchSessions(userId);
      return [...bucket(userId).values()]
        .map(summary)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    },

    async load(userId, id) {
      if (db?.loadSearchSession) return db.loadSearchSession(userId, id);
      return bucket(userId).get(id) ?? null;
    },

    async remove(userId, id) {
      if (db?.deleteSearchSession) return db.deleteSearchSession(userId, id);
      return bucket(userId).delete(id);
    },
  };
}

export type SearchSessionService = ReturnType<typeof createSearchSessionStore>;
