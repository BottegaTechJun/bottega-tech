import { describe, expect, test } from "bun:test";
import type { MatchupEvent, MatchupReplay } from "@repo/shared";
import { jsonSchema, simulateReadableStream, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createLedger, ground, harvest } from "./matchup.graph";
import { createMatchupService, type RunStore } from "./matchup.service";

const COMPANY = "6ebd9536-fcc5-5921-8938-ce3497eb6262";
const ROUND = "81a35997-c8e2-59de-8a9f-021d97e4f6a9";
const LIFELINE = "476a73ac-afa2-4713-9f73-188bc7ec0b95";
const KARMA = "1c10be1e-a148-40a9-a6ed-9f5c2e93af40";
const PRESS = "https://bebeez.eu/2024/11/12/in-parallel-seed/";

const src = (document: string, rank = "PRESS") => ({
  name: new URL(document).hostname,
  document,
  date: "2024-11-12",
  source_rank: rank,
});

/** A Cala MCP `entity_retrieval` result for the seed round, as the client returns it. */
const retrieval = {
  content: [{ type: "text", text: "{}" }],
  structuredContent: {
    id: ROUND,
    name: "Seed",
    entity_type: "FundingRound",
    properties: { round_label: { value: "SEED", sources: [src(PRESS)] } },
    relationships: {
      outgoing: {},
      incoming: {
        PARTICIPATES_IN_FUNDING_ROUND: [
          {
            id: LIFELINE,
            name: "Lifeline Ventures",
            entity_type: "Organization",
            properties: { role: "INVESTOR", is_lead: true, sources: [src(PRESS)] },
          },
          {
            id: COMPANY,
            name: "In Parallel",
            entity_type: "Company",
            properties: { role: "ISSUER", sources: [] },
          },
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Co-founder",
            entity_type: "Organization",
            properties: { role: "INVESTOR" },
          },
        ],
      },
    },
  },
};

const answer = {
  summary: "Start with Lifeline.",
  investors: [
    { id: LIFELINE, why: "Led the seed." },
    { id: "22222222-2222-4222-8222-222222222222", why: "Made up." },
  ],
  connections: [
    {
      from: LIFELINE,
      to: COMPANY,
      via: [ROUND],
      kind: "led",
      label: "Led the seed",
      reasoning: "Lifeline led In Parallel's seed round.",
      factors: ["Seed lead"],
      evidence: [`${PRESS}`, "https://invented.example.com/"],
    },
    {
      from: LIFELINE,
      to: KARMA,
      via: [],
      kind: "co_invested",
      label: "Invented",
      reasoning: "Karma never appeared in a tool result.",
      factors: [],
      evidence: [],
    },
  ],
};

describe("harvest", () => {
  test("reads entities and relationships from an MCP result", () => {
    const found = harvest(retrieval);
    expect(found.entities.map((e) => [e.name, e.role])).toEqual([
      ["Seed", "round"],
      ["Lifeline Ventures", "investor"],
      ["In Parallel", "company"],
    ]);
    const lead = found.facts.find((f) => f.from === LIFELINE);
    expect(lead).toMatchObject({ to: ROUND, role: "INVESTOR", lead: true });
    expect(found.facts.find((f) => f.from === COMPANY)?.lead).toBeNull();
    expect(found.cites.map((c) => c.url)).toContain(PRESS);
  });

  test("ignores prose results", () => {
    expect(harvest({ content: [{ type: "text", text: "no json here" }] }).entities).toEqual([]);
  });
});

describe("ground", () => {
  test("keeps only what tool results back", () => {
    const ledger = createLedger();
    ledger.add(harvest(retrieval));
    const graph = ground(answer as never, ledger, { sessionId: "s", companyId: COMPANY });

    expect(graph.investors.map((i) => i.id)).toEqual([LIFELINE]);
    expect(graph.connections).toHaveLength(1);
    const [link] = graph.connections;
    expect(link?.evidence.map((c) => c.url)).toEqual([PRESS]);
    expect(link?.facts.length).toBeGreaterThan(0);
    // Made-up investor, invented URL and the Karma link are all dropped.
    expect(graph.dropped).toBe(3);
    expect(graph.entities.map((e) => e.id).sort()).toEqual([COMPANY, LIFELINE, ROUND].sort());
  });
});

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const finish = (unified: "stop" | "tool-calls") => ({
  type: "finish" as const,
  finishReason: { unified, raw: undefined },
  usage,
});

function memoryStore(map: Map<string, MatchupReplay>): RunStore {
  return {
    load: async (id) => map.get(id) ?? null,
    save: async (id, run) => {
      map.set(id, run);
    },
  };
}

describe("matchup service", () => {
  test("keeps a finished run over a later partial one", async () => {
    const saved = new Map<string, MatchupReplay>([
      [COMPANY, { complete: true, savedAt: "x", events: [] }],
    ]);
    const service = createMatchupService({
      model: new MockLanguageModelV4(),
      modelId: "mock",
      tools: async () => {
        throw new Error("MCP down");
      },
      store: memoryStore(saved),
    });
    await service.run({ companyId: COMPANY, name: "x" }, () => {});
    expect(saved.get(COMPANY)?.savedAt).toBe("x");
  });

  test("streams thinking, tool calls and a grounded graph", async () => {
    const saved = new Map<string, MatchupReplay>();
    let turn = 0;
    const model = new MockLanguageModelV4({
      doStream: async () =>
        turn++ === 0
          ? {
              stream: simulateReadableStream({
                chunks: [
                  { type: "reasoning-start" as const, id: "r" },
                  { type: "reasoning-delta" as const, id: "r", delta: "Look up the seed round." },
                  { type: "reasoning-end" as const, id: "r" },
                  {
                    type: "tool-call" as const,
                    toolCallId: "t1",
                    toolName: "entity_retrieval",
                    input: JSON.stringify({ entity_id: ROUND }),
                  },
                  finish("tool-calls"),
                ],
              }),
            }
          : {
              stream: simulateReadableStream({
                chunks: [
                  {
                    type: "tool-call" as const,
                    toolCallId: "t2",
                    toolName: "submit_answer",
                    input: JSON.stringify(answer),
                  },
                  finish("tool-calls"),
                ],
              }),
            },
    });

    const fake = tool({
      inputSchema: jsonSchema<{ entity_id: string }>({ type: "object" }),
      execute: async () => retrieval,
    });
    const service = createMatchupService({
      model,
      modelId: "mock",
      tools: async () => ({ entity_retrieval: fake }),
      maxSteps: 2,
      store: memoryStore(saved),
    });

    const events: MatchupEvent[] = [];
    await service.run({ companyId: COMPANY, name: "In Parallel", sessionId: "warmup-1" }, (e) =>
      events.push(e),
    );

    expect(events.map((e) => e.type)).toEqual([
      "start",
      "step",
      "thinking",
      "tool-call",
      "tool-result",
      "step",
      "done",
    ]);
    expect(events[0]).toMatchObject({ sessionId: "warmup-1", model: "mock" });
    const done = events.at(-1);
    if (done?.type !== "done") throw new Error("no graph");
    expect(done.graph.sessionId).toBe("warmup-1");
    expect(done.graph.connections.map((c) => c.label)).toEqual(["Led the seed"]);
    // The finished run is saved for replay.
    expect(saved.get(COMPANY)?.complete).toBe(true);
    expect((await service.last(COMPANY))?.events).toEqual(events);
    // The last allowed step may only answer.
    expect(model.doStreamCalls[1]?.toolChoice).toEqual({ type: "tool", toolName: "submit_answer" });
  });

  test("reports failures as an error event", async () => {
    const service = createMatchupService({
      model: new MockLanguageModelV4(),
      modelId: "mock",
      tools: async () => {
        throw new Error("MCP down");
      },
    });
    const events: MatchupEvent[] = [];
    await service.run({ companyId: COMPANY, name: "x" }, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(["start", "error"]);
    expect(events[0]?.type === "start" && events[0].sessionId.startsWith("warmup-")).toBe(true);
  });
});
