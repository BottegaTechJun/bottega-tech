import { beforeEach, describe, expect, test } from "bun:test";
import type { MatchupEvent, SearchSessionInput, SearchSessionSummary } from "@repo/shared";
import { local, toSession } from "./local";

/** In-memory localStorage; `limit` makes writes over that many characters throw like a full store. */
function storage(limit = Number.POSITIVE_INFINITY) {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > limit) throw new Error("QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
}

const input: SearchSessionInput = {
  company: { id: "c1", name: "In Parallel", website: null, hq: null, description: null },
  facts: null,
  prefs: { round: ["A"], size: [], geo: [], lead: [], sector: [], timing: [] },
};

const done: MatchupEvent = {
  type: "done",
  graph: {
    sessionId: "s1",
    companyId: "c1",
    summary: "Ask Lifeline first.",
    entities: [],
    investors: [{ id: "i1", why: "Led a similar round", evidence: [] }],
    connections: [],
    dropped: 0,
  },
};

const start: MatchupEvent = { type: "start", sessionId: "s1", model: "m", traceUrl: null };

describe("local searches", () => {
  beforeEach(() => {
    Object.assign(globalThis, { localStorage: storage() });
  });

  test("a finished stream is complete, one with an error is not", () => {
    expect(toSession("s1", input, [start, done], null).status).toBe("complete");
    const failed = toSession("s1", input, [start, done, { type: "error", message: "x" }], null);
    expect(failed.status).toBe("incomplete");
    expect(failed.replay.complete).toBe(false);
  });

  test("keeps, reads back and removes a search per user", () => {
    expect(local.keep("u1", toSession("s1", input, [start, done], null))).toBe(true);
    expect(local.get("u1", "s1")?.input.company.name).toBe("In Parallel");
    expect(local.get("u2", "s1")).toBeNull();
    local.remove("u1", "s1");
    expect(local.ids("u1")).toEqual([]);
  });

  test("merge adds only searches the API does not have, with picks counted", () => {
    local.keep("u1", toSession("s1", input, [start, done], null));
    local.keep("u1", toSession("s2", input, [start], "s1"));
    const saved: SearchSessionSummary = {
      id: "s2",
      input,
      status: "complete",
      savedAt: "2026-11-15T00:00:00.000Z",
      parentId: null,
      picks: 2,
      question: null,
    };
    const merged = local.merge("u1", [saved]);
    expect(merged.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
    expect(merged.find((s) => s.id === "s1")?.picks).toBe(1);
    expect(merged.find((s) => s.id === "s2")?.picks).toBe(2);
  });

  test("drops the oldest searches when storage is full", () => {
    const one = JSON.stringify([toSession("s0", input, [start, done], null)]).length;
    Object.assign(globalThis, { localStorage: storage(one * 2 + 10) });
    for (const id of ["s1", "s2", "s3"])
      local.keep("u1", toSession(id, input, [start, done], null));
    expect(local.ids("u1")).toEqual(["s3", "s2"]);
  });

  test("bad stored data reads as empty", () => {
    localStorage.setItem("bottega.searches.v1:u1", "{not json");
    expect(local.ids("u1")).toEqual([]);
  });
});
