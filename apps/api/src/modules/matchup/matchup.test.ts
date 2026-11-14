import { describe, expect, test } from "bun:test";
import {
  type MatchupEvent,
  type MatchupReplay,
  matchupRequestSchema,
  type RunSummary,
  type SavedProfile,
} from "@repo/shared";
import { jsonSchema, simulateReadableStream, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  backing,
  createLedger,
  dealDate,
  ground,
  harvest,
  partialGraph,
  replay,
} from "./matchup.graph";
import { agentAnswerSchema } from "./matchup.schemas";
import {
  brief,
  createMatchupService,
  FOLLOW_UP_STEPS,
  followUpBrief,
  instructions,
  type ProfileRuns,
  type RunStore,
  wants,
} from "./matchup.service";

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
    { id: LIFELINE, why: "Led the seed.", evidence: [PRESS] },
    { id: "22222222-2222-4222-8222-222222222222", why: "Made up.", evidence: [PRESS] },
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

describe("partialGraph", () => {
  test("keeps sourced investor candidates when the agent stops before answering", () => {
    const ledger = createLedger();
    ledger.add(harvest(retrieval));

    const graph = partialGraph(ledger, {
      sessionId: "s",
      companyId: COMPANY,
      companyName: "In Parallel",
    });

    expect(graph.investors.map((investor) => investor.id)).toEqual([LIFELINE]);
    expect(graph.investors[0]?.evidence.map((cite) => cite.url)).toEqual([PRESS]);
    expect(graph.summary).toContain("stopped before the full match");
  });
});

/** A finished first run, as a profile saves it: one Cala read and the grounded answer. */
function finished(sessionId = "warmup-1", savedAt = "2026-01-01"): MatchupReplay {
  const found = harvest(retrieval);
  const ledger = createLedger();
  ledger.add(found);
  const graph = ground(answer as never, ledger, { sessionId, companyId: COMPANY });
  return {
    complete: true,
    savedAt,
    events: [
      { type: "start", sessionId, model: "mock", traceUrl: null },
      {
        type: "tool-result",
        id: "t1",
        tool: "entity_retrieval",
        summary: "Seed · 3 entities",
        ok: true,
        entities: found.entities,
        facts: found.facts,
      },
      { type: "done", graph },
    ],
  };
}

describe("replay", () => {
  test("rebuilds a saved run's ledger so a new answer grounds against it", () => {
    const ledger = createLedger();
    ledger.add(replay(finished().events));
    const graph = ground(answer as never, ledger, { sessionId: "s2", companyId: COMPANY });

    expect(graph.investors.map((i) => i.id)).toEqual([LIFELINE]);
    expect(graph.connections.map((c) => c.evidence.map((e) => e.url))).toEqual([[PRESS]]);
    expect(graph.dropped).toBe(3);
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

const PROFILE: SavedProfile = {
  id: "7e57a3c1-0000-4000-8000-000000000000",
  company: { id: COMPANY, name: "In Parallel", description: null, hq: null, website: null },
  facts: null,
  prefs: { round: ["A"], size: [], geo: ["Nordics"], lead: [], sector: [], timing: [] },
  createdAt: "x",
  updatedAt: "x",
};

/** `PROFILE` with saved runs held in memory; added runs land in `added`. */
function profileRuns(
  runs: Record<string, MatchupReplay> = {},
  added: [string, string, MatchupReplay][] = [],
): ProfileRuns {
  return {
    get: async (id) => (id === PROFILE.id ? PROFILE : null),
    addRun: async (id, name, run) => {
      added.push([id, name, run]);
      return name;
    },
    run: async (_id, runId) => runs[runId] ?? null,
    listRuns: async () =>
      Object.entries(runs)
        .map(
          ([id, r]): RunSummary => ({
            id,
            sessionId: null,
            savedAt: r.savedAt,
            complete: r.complete,
            picks: 0,
            question: null,
            parent: null,
          }),
        )
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
  };
}

/** A model that answers straight away with `input`. */
function answering(input: unknown) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          {
            type: "tool-call" as const,
            toolCallId: "t1",
            toolName: "submit_answer",
            input: JSON.stringify(input),
          },
          finish("tool-calls"),
        ],
      }),
    }),
  });
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

  test("runs for a saved profile and keeps every run under it", async () => {
    const added: [string, string, MatchupReplay][] = [];
    const legacy = new Map<string, MatchupReplay>();
    const model = answering({ summary: "None", investors: [], connections: [] });
    const service = createMatchupService({
      model,
      modelId: "mock",
      tools: async () => ({}),
      store: memoryStore(legacy),
      profiles: profileRuns({}, added),
    });
    await service.run(
      { companyId: COMPANY, name: "In Parallel", sessionId: "warmup-2", profileId: PROFILE.id },
      () => {},
    );

    expect(added.map(([id, name, run]) => [id, name, run.complete])).toEqual([
      [PROFILE.id, "warmup-2", true],
    ]);
    expect(legacy.size).toBe(0);
    expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain("raising Series A");
  });

  test("reports an unknown profile as an error event", async () => {
    const service = createMatchupService({
      model: new MockLanguageModelV4(),
      modelId: "mock",
      tools: async () => ({}),
      profiles: { ...profileRuns(), get: async () => null },
    });
    const events: MatchupEvent[] = [];
    await service.run({ companyId: COMPANY, name: "x", profileId: PROFILE.id }, (e) =>
      events.push(e),
    );
    expect(events.at(-1)).toEqual({ type: "error", message: "No saved profile with this id" });
  });
});

describe("follow-ups", () => {
  const ask = (question: string, parent?: string) => ({
    companyId: COMPANY,
    name: "In Parallel",
    sessionId: "warmup-3",
    profileId: PROFILE.id,
    followUp: parent ? { question, parent } : { question },
  });

  test("revise the parent's answer without a new Cala call", async () => {
    const added: [string, string, MatchupReplay][] = [];
    const model = answering(answer);
    const service = createMatchupService({
      model,
      modelId: "mock",
      tools: async () => ({}),
      profiles: profileRuns({ "warmup-1": finished() }, added),
    });
    const events: MatchupEvent[] = [];
    await service.run(ask("Only funds that led a Series A", "warmup-1"), (e) => events.push(e));

    expect(events.map((e) => e.type)).toEqual(["start", "follow-up", "step", "done"]);
    const context = events[1];
    if (context?.type !== "follow-up") throw new Error("no follow-up event");
    expect(context.parent).toBe("warmup-1");
    expect(context.question).toBe("Only funds that led a Series A");
    expect(context.entities.map((e) => e.id)).toContain(LIFELINE);

    // The parent's entities, facts and evidence ground the answer; invented items still drop.
    const done = events.at(-1);
    if (done?.type !== "done") throw new Error("no graph");
    expect(done.graph.investors.map((i) => i.id)).toEqual([LIFELINE]);
    expect(done.graph.connections.map((c) => c.evidence.map((e) => e.url))).toEqual([[PRESS]]);
    expect(done.graph.dropped).toBe(3);

    const prompt = JSON.stringify(model.doStreamCalls[0]?.prompt);
    expect(prompt).toContain("This is a follow-up");
    expect(prompt).toContain("follow the question");
    expect(prompt).toContain("Previous answer: Start with Lifeline.");
    expect(prompt).toContain("Only funds that led a Series A");
    // Saved beside its parent, which stays as it was.
    expect(added.map(([, name, run]) => [name, run.events[1]?.type])).toEqual([
      ["warmup-3", "follow-up"],
    ]);
  });

  test("build on the newest finished run when no parent is named", async () => {
    const partial: MatchupReplay = { complete: false, savedAt: "2026-01-02", events: [] };
    const service = createMatchupService({
      model: answering(answer),
      modelId: "mock",
      tools: async () => ({}),
      profiles: profileRuns({ "warmup-1": finished(), "warmup-2": partial }),
    });
    const events: MatchupEvent[] = [];
    await service.run(ask("Only Nordic funds"), (e) => events.push(e));
    expect(events.find((e) => e.type === "follow-up")).toMatchObject({ parent: "warmup-1" });
  });

  test("report a missing parent as an error event", async () => {
    const service = createMatchupService({
      model: answering(answer),
      modelId: "mock",
      tools: async () => ({}),
      profiles: profileRuns({ "warmup-1": finished() }),
    });
    const events: MatchupEvent[] = [];
    await service.run(ask("Only Nordic funds", "gone"), (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(["start", "error"]);
    expect(events.at(-1)).toEqual({ type: "error", message: "No saved run to follow up" });
  });

  test("refuse a run that was for another company", async () => {
    const service = createMatchupService({
      model: answering(answer),
      modelId: "mock",
      tools: async () => ({}),
      profiles: profileRuns({ "warmup-1": finished() }),
    });
    const events: MatchupEvent[] = [];
    await service.run({ ...ask("Only Nordic funds", "warmup-1"), companyId: KARMA }, (e) =>
      events.push(e),
    );
    expect(events.at(-1)).toEqual({ type: "error", message: "That run was for another company" });
  });

  test("get fewer steps than a first run and must answer on the last one", async () => {
    // A model that keeps exploring until it is forced to answer.
    const exploring = () =>
      new MockLanguageModelV4({
        doStream: async (options) => ({
          stream: simulateReadableStream({
            chunks: [
              options.toolChoice?.type === "tool"
                ? {
                    type: "tool-call" as const,
                    toolCallId: "a",
                    toolName: "submit_answer",
                    input: JSON.stringify(answer),
                  }
                : {
                    type: "tool-call" as const,
                    toolCallId: crypto.randomUUID(),
                    toolName: "entity_retrieval",
                    input: JSON.stringify({ entity_id: ROUND }),
                  },
              finish("tool-calls"),
            ],
          }),
        }),
      });
    const fake = tool({
      inputSchema: jsonSchema<{ entity_id: string }>({ type: "object" }),
      execute: async () => retrieval,
    });
    const steps = async (
      request: Parameters<ReturnType<typeof createMatchupService>["run"]>[0],
    ) => {
      const model = exploring();
      const service = createMatchupService({
        model,
        modelId: "mock",
        tools: async () => ({ entity_retrieval: fake }),
        maxSteps: 9,
        profiles: profileRuns({ "warmup-1": finished() }),
      });
      const events: MatchupEvent[] = [];
      await service.run(request, (e) => events.push(e));
      expect(events.at(-1)?.type).toBe("done");
      return model.doStreamCalls.length;
    };

    expect(await steps(ask("Only Nordic funds", "warmup-1"))).toBe(FOLLOW_UP_STEPS);
    expect(await steps({ companyId: COMPANY, name: "In Parallel", profileId: PROFILE.id })).toBe(9);
  });

  test("need a saved profile", () => {
    const { profileId: _, ...bare } = ask("Only Nordic funds");
    expect(matchupRequestSchema.safeParse(bare).success).toBe(false);
    expect(matchupRequestSchema.safeParse(ask("Only Nordic funds")).success).toBe(true);
  });
});

describe("brief", () => {
  test("states what the company wants next", () => {
    expect(
      wants({
        round: ["B"],
        size: ["€15-30M"],
        geo: [],
        lead: ["lead"],
        sector: [],
        timing: ["now"],
      }),
    ).toBe("What it wants next: raising Series B; size €15-30M; looking for a lead; starting now.");
    expect(brief({ companyId: COMPANY, name: "In Parallel" }, null)).not.toContain("wants");
  });
});

describe("evidence", () => {
  const pick = (investors: unknown[]) => {
    const ledger = createLedger();
    ledger.add(harvest(retrieval));
    ledger.add(harvest(searchResult(KARMA)));
    return ground({ summary: "s", connections: [], investors } as never, ledger, {
      sessionId: "s",
      companyId: COMPANY,
    });
  };

  test("backs a pick the agent left unsourced with the investor's own round records", () => {
    const invented = pick([
      { id: LIFELINE, why: "Led the seed.", evidence: ["https://invented.example.com/"] },
    ]);
    expect(invented.investors.map((i) => i.evidence.map((e) => e.url))).toEqual([[PRESS]]);
    // Only the invented URL is dropped.
    expect(invented.dropped).toBe(1);

    // An answer without the field at all still parses and grounds.
    const parsed = agentAnswerSchema.parse({
      summary: "s",
      connections: [],
      investors: [{ id: LIFELINE, why: "Led the seed." }],
    });
    expect(pick(parsed.investors).investors[0]?.evidence.map((e) => e.url)).toEqual([PRESS]);
  });

  test("drops an investor nothing in the run backs, and lists a repeated one once", () => {
    // Karma is only named in a search answer: a known id, but no record of what it backed.
    const graph = pick([
      { id: KARMA, why: "Named in a search.", evidence: [] },
      { id: LIFELINE, why: "Led the seed.", evidence: [PRESS] },
      { id: LIFELINE, why: "Again.", evidence: [PRESS] },
    ]);
    expect(graph.investors.map((i) => i.id)).toEqual([LIFELINE]);
    expect(graph.dropped).toBe(1);
  });

  test("reads knowledge_search sources as citations without a date", () => {
    const found = harvest(searchResult(LIFELINE));
    expect(found.cites).toEqual([
      { name: "press.example", url: SEARCH, date: null, rank: "OTHER" },
    ]);
  });

  test("keeps an investor backed by a search source", () => {
    const ledger = createLedger();
    ledger.add(harvest(searchResult(LIFELINE)));
    const graph = ground(
      {
        summary: "s",
        investors: [{ id: LIFELINE, why: "Active.", evidence: [SEARCH] }],
        connections: [],
      } as never,
      ledger,
      { sessionId: "s", companyId: COMPANY },
    );
    expect(graph.investors.map((i) => i.evidence.map((e) => e.url))).toEqual([[SEARCH]]);
  });

  test("lists each pick's dated rounds and sources in a follow-up", () => {
    const ledger = createLedger();
    ledger.add(replay(finished().events));
    const graph = ground(answer as never, ledger, { sessionId: "s", companyId: COMPANY });
    const text = followUpBrief('Only "Nordic" funds', graph, ledger);
    expect(text).toContain("Rounds: Seed (2024-11-12), led");
    expect(text).toContain(`Sources: ${PRESS} (2024-11-12)`);
    expect(text).toContain('follow-up question: "Only \\"Nordic\\" funds"');

    // A run saved before picks carried evidence still gives the agent sources to copy.
    const old = { ...graph, investors: graph.investors.map((p) => ({ ...p, evidence: [] })) };
    expect(followUpBrief("q", old, ledger)).toContain(`Sources: ${PRESS} (2024-11-12)`);
  });

  test("dates a round by its first report, not by a later re-crawl", () => {
    const cite = (date: string) => ({
      name: "x",
      url: `https://x.example/${date}`,
      date,
      rank: "PRESS" as const,
    });
    const fact = {
      from: LIFELINE,
      to: ROUND,
      relation: "PARTICIPATES_IN_FUNDING_ROUND",
      role: "INVESTOR",
      lead: null,
      sources: [cite("2026-11-13"), cite("2021-05-12"), cite("2024-07-08")],
    };
    expect(dealDate(fact)).toBe("2021-05-12");
    expect(dealDate({ ...fact, sources: [] })).toBeNull();
    // Backing sources come newest first.
    expect(backing([fact], LIFELINE, 2).map((c) => c.date)).toEqual(["2026-11-13", "2024-07-08"]);
  });
});

describe("instructions", () => {
  test("give today's date, the evidence rule and Cala's field names", () => {
    for (const followUp of [true, false]) {
      const text = instructions(followUp, new Date("2026-11-14T10:00:00Z"));
      expect(text).toContain("Today is 2026-11-14.");
      expect(text).toContain("Every suggested investor needs evidence");
      expect(text).toContain("entity_introspection first");
      expect(text.includes("This is a follow-up")).toBe(followUp);
    }
  });
});

/** A knowledge_search answer that names one entity and cites one publisher article, undated. */
const SEARCH = "https://press.example/ventech";
function searchResult(entity: string) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          content: "Lifeline backed Ventech.",
          explainability: [{ content: "Lifeline backed Ventech.", references: ["c1"] }],
          context: [
            {
              id: "c1",
              content: "Lifeline backed Ventech.",
              origins: [
                {
                  source: { name: "press.example", url: "https://press.example" },
                  document: { name: "Article", url: SEARCH },
                  breadcrumb: [],
                },
              ],
            },
          ],
          entities: [{ id: entity, name: "Lifeline Ventures", entity_type: "Organization" }],
        }),
      },
    ],
  };
}
