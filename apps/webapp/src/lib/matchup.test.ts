import { describe, expect, test } from "bun:test";
import type { MatchupEvent } from "@repo/shared";
import { idle, reduce } from "./matchup";

const inherited: MatchupEvent = {
  type: "follow-up",
  question: "Only Nordic funds",
  parent: "warmup-1",
  entities: [{ id: "a", name: "Lifeline Ventures", type: "Organization", role: "investor" }],
  facts: [
    {
      from: "a",
      to: "round",
      relation: "PARTICIPATES_IN_FUNDING_ROUND",
      role: "INVESTOR",
      lead: true,
      sources: [],
    },
  ],
};

describe("follow-up runs", () => {
  test("know their question from the first moment when the parent is on screen", () => {
    const followUp = { question: "Only Nordic funds", parent: "warmup-1" };
    const run = reduce(idle, { type: "begin", sessionId: "s", followUp });
    expect(run.status).toBe("running");
    expect(run.followUp).toEqual(followUp);
    expect(reduce(idle, { type: "begin", sessionId: "s" }).followUp).toBeNull();
  });

  test("start from what the parent saw in Cala", () => {
    const begun = reduce(idle, { type: "begin", sessionId: "s" });
    const run = reduce(begun, { type: "event", event: inherited });
    expect(run.followUp).toEqual({ question: "Only Nordic funds", parent: "warmup-1" });
    expect(run.entities.a?.name).toBe("Lifeline Ventures");
    expect(Object.values(run.facts)).toHaveLength(1);
    expect(run.trace).toEqual([
      { kind: "context", key: "ctx", question: "Only Nordic funds", entities: 1, facts: 1 },
    ]);
  });

  test("replay on their own, with the inherited names", () => {
    const run = reduce(idle, {
      type: "replay",
      saved: { complete: false, savedAt: "2026-11-14T10:00:00Z", events: [inherited] },
    });
    expect(run.status).toBe("incomplete");
    expect(run.followUp?.parent).toBe("warmup-1");
    expect(run.entities.a?.role).toBe("investor");
  });
});
