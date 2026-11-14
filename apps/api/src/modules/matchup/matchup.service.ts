import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import type {
  MatchupEvent,
  MatchupGraph,
  MatchupReplay,
  MatchupRequest,
  Prefs,
  ProfileInput,
  RunSummary,
  SavedProfile,
} from "@repo/shared";
import {
  hasToolCall,
  isStepCount,
  type LanguageModel,
  ToolLoopAgent,
  type ToolSet,
  tool,
} from "ai";
import type { SearchSessionStore } from "../searches/searches.service";
import {
  backing,
  createLedger,
  dealDate,
  ground,
  harvest,
  type Ledger,
  partialGraph,
  replay,
} from "./matchup.graph";
import { agentAnswerSchema } from "./matchup.schemas";

const ANSWER = "submit_answer";
const SLUSH_2026 = "bc844d56-6ab4-452b-96bf-2661e86e592b";

const ROLE = `You match a startup with investors for its next round, using only Cala's knowledge graph tools.`;

const RULES = `Rules: use only ids and source URLs that appear in tool results. Every suggested investor needs evidence: copy at least one source URL from a tool result that shows its activity, and leave out any investor without one. Search results carry no dates, so when an answer depends on how recent something is, use a dated funding round or event record (entity_retrieval) and cite its source. A missing is_lead means unknown, never "did not lead". State what happened, never predict intent. Suggest at most 5 investors.`;

const CALA = `Cala read discipline: for every new entity UUID, call entity_introspection first. Use its response as the source of truth for available properties, relationship names, and incoming/outgoing direction. Then call entity_retrieval with only the exact fields and relationships that introspection returned; never guess a relationship or reverse its direction. Introspect independent entities in parallel and reuse any entity already seen. Useful relationships, when introspection confirms them, include PARTICIPATES_IN_FUNDING_ROUND, INVESTED_IN, HAS_HEADQUARTERS_IN, OPERATES_IN_INDUSTRY, PARTICIPATES_IN_EVENT, FOUNDED, IS_CEO_OF, IS_BOARD_MEMBER_OF and WORKS_AT. A funding round may expose round_label, announcement_date and transaction_value. Omit fields that are not available.`;

const FIRST_RUN = `Start from the company's funding rounds and current investors. Follow those investors' other rounds to find funds that led later rounds (Series A and up) of similar companies, and how they connect to the company's investors: shared rounds, co-investments, people, events (Slush 2026 is ${SLUSH_2026}).
When the company says what it wants next, prefer investors that fit it.
${RULES}
${CALA}
Work fast: introspect independent seeds in parallel, then make about 10 to 15 total tool calls. Call ${ANSWER} once with your answer as soon as the evidence is sufficient.`;

const FOLLOW_UP = `This is a follow-up. You already answered, and the founder now asks a question about that answer. Don't start over: revise the previous answer so it answers the question.
The prompt lists each suggested investor with the rounds and sources already on record. Everything the previous run saw in Cala counts as a tool result, so reuse its ids and URLs and call tools only for what it doesn't show.
When the question narrows the list, keep an investor only if those records or a new tool result show that it fits. Drop the others and name in the summary the ones you could not confirm. To check an investor's recent deals or the rounds it led, read its PARTICIPATES_IN_FUNDING_ROUND relations with one entity_retrieval.
Keep what still fits, copied with the same ids and evidence URLs. Look for new investors only when the question asks for them (Slush 2026 is ${SLUSH_2026}).
When the question and what the company said it wants next disagree, follow the question.
The summary answers the question directly. If no investor fits, return none and say so in the summary.
${RULES}
${CALA}
Work fast: one or two rounds of tool calls, several at once, about 8 calls at most. Then call ${ANSWER} once with your answer.`;

/** System instructions for a first run or for a follow-up on a finished run. Dates need today. */
export function instructions(followUp: boolean, now = new Date()): string {
  return `${ROLE} Today is ${now.toISOString().slice(0, 10)}.\n${followUp ? FOLLOW_UP : FIRST_RUN}`;
}

/** A follow-up revises an answer, so it gets fewer steps than a first run: five to look, one to answer. */
export const FOLLOW_UP_STEPS = 6;

const MAX_EVENT_ITEMS = 60;
/** Entities from the previous run listed in a follow-up prompt */
const MAX_KNOWN = 80;
/** Rounds listed per suggested investor in a follow-up prompt, newest first */
const MAX_ROUNDS = 8;
const KNOWN_ORDER = ["investor", "company", "person", "event", "round", "other"];

export interface MatchupDeps {
  model: LanguageModel;
  modelId: string;
  tools: () => Promise<ToolSet>;
  maxSteps?: number;
  /** Langfuse session page for a session id, when configured */
  sessionUrl?: (sessionId: string) => string | null;
  /** Called after each run, e.g. to flush spans */
  after?: () => Promise<void>;
  /** Keeps the last run per company so it can be replayed without the agent */
  store?: RunStore;
  /** Saved profiles: a run with a profileId reads its company and preferences and is kept under it */
  profiles?: ProfileRuns;
  /** User-owned investor searches. The legacy stores remain only for compatibility tests. */
  sessions?: SearchSessionStore;
}

export interface ProfileRuns {
  get(id: string): Promise<SavedProfile | null>;
  addRun(id: string, name: string, run: MatchupReplay): Promise<string>;
  /** One saved run, for follow-ups */
  run(id: string, runId: string): Promise<MatchupReplay | null>;
  /** Newest first */
  listRuns(id: string): Promise<RunSummary[]>;
}

export interface RunStore {
  load(companyId: string): Promise<MatchupReplay | null>;
  save(companyId: string, run: MatchupReplay): Promise<void>;
}

export type MatchupService = ReturnType<typeof createMatchupService>;
export type Emit = (event: MatchupEvent) => void;

function clip(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toolError(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  if (record.isError !== true) return null;
  if (typeof record.error === "string") return clip(record.error, 180);
  if (Array.isArray(record.content)) {
    const text = record.content
      .flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const value = (item as Record<string, unknown>).text;
        return typeof value === "string" ? [value] : [];
      })
      .join(" ")
      .trim();
    if (text) return clip(text, 180);
  }
  return null;
}

const ROUNDS: Record<string, string> = { A: "Series A", B: "Series B", C: "Series C" };
const ROLES: Record<string, string> = {
  lead: "a lead",
  "co-lead": "a co-lead",
  follow: "a follower",
};
const TIMING: Record<string, string> = {
  now: "now",
  "3m": "in 3 months",
  "6m": "in 6 months",
  later: "later",
};

/** One line on what the company wants next, from its saved preferences. Empty when unknown. */
export function wants(prefs: Prefs): string {
  const parts = [
    prefs.round.length && `raising ${prefs.round.map((r) => ROUNDS[r] ?? r).join(" or ")}`,
    prefs.size.length && `size ${prefs.size.join(", ")}`,
    prefs.lead.length && `looking for ${prefs.lead.map((r) => ROLES[r] ?? r).join(" or ")}`,
    prefs.geo.length && `investors in ${prefs.geo.join(", ")}`,
    prefs.sector.length && `sector ${prefs.sector.join(", ")}`,
    prefs.timing.length && `starting ${prefs.timing.map((t) => TIMING[t] ?? t).join(", ")}`,
  ].filter(Boolean);
  return parts.length ? `What it wants next: ${parts.join("; ")}.` : "";
}

/**
 * The user prompt: the company, a few known facts, and what it wants next. A follow-up's
 * context (see `followUpBrief`) takes the place of the closing request.
 */
export function brief(
  req: MatchupRequest,
  profile: Pick<ProfileInput, "facts" | "prefs"> | null,
  followUp = "",
): string {
  const facts = profile?.facts;
  const known = [
    facts?.hq?.value && `HQ ${facts.hq.value}`,
    facts?.stage?.value && `stage ${facts.stage.value}`,
    facts?.investors.length && `investors ${facts.investors.map((i) => i.name).join(", ")}`,
  ].filter(Boolean);
  return [
    `Company: ${req.name} (Cala id ${req.companyId}).${known.length ? ` Known: ${known.join("; ")}.` : ""}`,
    profile ? wants(profile.prefs) : "",
    followUp || "Find the right investors for its next round and how they connect.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * What a follow-up starts from: the previous answer, each suggested investor with its rounds
 * and sources (dated, so a question about recent activity can be checked), the connections,
 * the other entities that run saw, and the founder's question.
 */
export function followUpBrief(question: string, graph: MatchupGraph, ledger: Ledger): string {
  const name = (id: string) => ledger.entities.get(id)?.name ?? id;
  const facts = [...ledger.facts.values()];
  const stamp = (date: string | null) => (date ? ` (${date})` : "");
  const picks = graph.investors.map((p, i) => {
    const rounds = facts
      .filter(
        (f) =>
          f.from === p.id &&
          f.relation === "PARTICIPATES_IN_FUNDING_ROUND" &&
          f.role === "INVESTOR",
      )
      .map((f) => ({ label: name(f.to), led: f.lead === true, date: dealDate(f) }))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, MAX_ROUNDS)
      .map((r) => `${r.label}${stamp(r.date)}${r.led ? ", led" : ""}`);
    // Runs saved before picks carried evidence fall back to the investor's sourced records.
    const cited = p.evidence.length ? p.evidence : backing(facts, p.id);
    const sources = cited.map((c) => `${c.url ?? c.name}${stamp(c.date)}`);
    return [
      `${i + 1}. ${name(p.id)} (id ${p.id}): ${p.why}`,
      `   Rounds: ${rounds.join("; ") || "none recorded"}`,
      `   Sources: ${sources.join(" ") || "none"}`,
    ].join("\n");
  });
  const links = graph.connections.map((c) => {
    const path = [c.from, ...c.via, c.to].map((id) => `${name(id)} (${id})`).join(" → ");
    const urls = c.evidence.flatMap((cite) => (cite.url ? [cite.url] : []));
    return `- ${c.label} [${c.kind}]: ${path}${urls.length ? `. Evidence: ${urls.join(" ")}` : ""}`;
  });
  const seen = [...ledger.entities.values()]
    .sort((a, b) => KNOWN_ORDER.indexOf(a.role) - KNOWN_ORDER.indexOf(b.role))
    .slice(0, MAX_KNOWN)
    .map((e) => `${e.name} (${e.role}, ${e.id})`);
  return [
    `Previous answer: ${graph.summary}`,
    picks.length ? `Suggested investors:\n${picks.join("\n")}` : "Suggested investors: none.",
    links.length ? `Connections:\n${links.join("\n")}` : "",
    seen.length ? `Also seen in Cala, reusable without a lookup: ${seen.join("; ")}.` : "",
    `The founder's follow-up question: ${JSON.stringify(question)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

interface Turn {
  req: MatchupRequest;
  prompt: string;
  followUp: boolean;
  sessionId: string;
  emit: Emit;
  /** Holds what a follow-up inherited; the run adds what it finds */
  ledger: Ledger;
  signal?: AbortSignal;
}

export function createMatchupService(deps: MatchupDeps) {
  const { model, modelId, maxSteps = 16 } = deps;

  /** Runs one lookup and emits its progress. Never throws; failures become an `error` event. */
  async function run(
    req: MatchupRequest,
    send: Emit,
    signal?: AbortSignal,
    userId?: string,
  ): Promise<void> {
    const events: MatchupEvent[] = [];
    const emit: Emit = (event) => {
      events.push(event);
      send(event);
    };
    const sessionId = req.sessionId ?? `warmup-${crypto.randomUUID()}`;
    const savedProfile = req.profileId ? ((await deps.profiles?.get(req.profileId)) ?? null) : null;
    const profile = req.profile ?? savedProfile;
    emit({
      type: "start",
      sessionId,
      model: modelId,
      traceUrl: deps.sessionUrl?.(sessionId) ?? null,
    });

    // Save a resumable shell before the agent starts. A browser can close while the agent is
    // working, but the founder should still see the session and its partial trace afterwards.
    if (userId && deps.sessions && profile) {
      await deps.sessions
        .save(
          userId,
          sessionId,
          profile,
          { complete: false, savedAt: new Date().toISOString(), events: [...events] },
          req.followUp?.parent ?? null,
        )
        .catch((err) => console.error("Saving initial search snapshot failed", err));
    }

    const followUp = req.followUp;
    try {
      await startActiveObservation(
        "investor-matchup",
        (root) =>
          propagateAttributes(
            {
              sessionId,
              traceName: "investor-matchup",
              tags: [
                "matchup",
                ...(req.profileId ? [`profile:${req.profileId}`] : []),
                ...(userId ? [`user:${userId}`] : []),
                ...(followUp ? ["follow-up"] : []),
              ],
              metadata: {
                companyId: req.companyId,
                model: modelId,
                ...(req.profileId ? { profileId: req.profileId } : {}),
                ...(userId ? { userId } : {}),
                ...(followUp ? { parentRun: followUp.parent ?? "latest" } : {}),
              },
            },
            async () => {
              const input = {
                companyId: req.companyId,
                profileId: req.profileId,
                question: followUp?.question,
              };
              root.update({ input });
              try {
                if (req.profileId && !savedProfile) {
                  throw new Error("No saved profile with this id");
                }
                if (userId && !profile) {
                  throw new Error("No founder context was provided for this search");
                }
                const ledger = createLedger();
                let prompt = brief(req, profile);
                if (followUp) {
                  const parent = await parentRun(userId, req.profileId, followUp.parent);
                  if (!parent) throw new Error("No saved run to follow up");
                  const done = parent.replay.events.filter((e) => e.type === "done").at(-1);
                  if (done?.type !== "done") throw new Error("The previous run did not finish");
                  // A profile keeps its runs when its company changes.
                  if (done.graph.companyId !== req.companyId) {
                    throw new Error("That run was for another company");
                  }
                  ledger.add(replay(parent.replay.events));
                  const known = [...ledger.entities.values()];
                  emit({
                    type: "follow-up",
                    question: followUp.question,
                    parent: parent.id,
                    entities: known,
                    facts: [...ledger.facts.values()],
                  });
                  prompt = brief(
                    req,
                    profile,
                    followUpBrief(followUp.question, done.graph, ledger),
                  );
                }
                root.update({ input: { ...input, prompt } });
                const graph = await loop({
                  req,
                  prompt,
                  followUp: Boolean(followUp),
                  sessionId,
                  emit,
                  ledger,
                  signal,
                });
                root.update({ output: graph });
              } catch (err) {
                const text = signal?.aborted ? "Run stopped" : message(err);
                root.update({ level: "ERROR", statusMessage: text });
                emit({ type: "error", message: text });
              }
            },
          ),
        { asType: "agent" },
      );
    } finally {
      await deps.after?.().catch(() => undefined);
      await keep(req, profile, sessionId, events, userId).catch((err) =>
        console.error("Saving run failed", err),
      );
    }
  }

  /**
   * A profile's runs are all kept, side by side. Without a profile, a finished run replaces
   * the company's saved one and a partial run is kept only when nothing finished.
   */
  async function keep(
    req: MatchupRequest,
    profile: Pick<ProfileInput, "company" | "facts" | "prefs"> | null,
    sessionId: string,
    events: MatchupEvent[],
    userId?: string,
  ) {
    const complete =
      events.some((e) => e.type === "done") && !events.some((e) => e.type === "error");
    const savedAt = new Date().toISOString();
    if (userId && deps.sessions && profile) {
      await deps.sessions.save(
        userId,
        sessionId,
        profile,
        { complete, savedAt, events },
        req.followUp?.parent ?? null,
      );
      return;
    }
    if (profile && deps.profiles && req.profileId) {
      await deps.profiles.addRun(req.profileId, sessionId, { complete, savedAt, events });
      return;
    }
    const { companyId } = req;
    if (!deps.store) return;
    if (!complete && (await deps.store.load(companyId))?.complete) return;
    await deps.store.save(companyId, { complete, savedAt, events });
  }

  async function last(companyId: string): Promise<MatchupReplay | null> {
    return (await deps.store?.load(companyId)) ?? null;
  }

  /** The run a follow-up builds on, always scoped to the authenticated owner when available. */
  async function parentRun(userId: string | undefined, profileId?: string, runId?: string) {
    if (userId && deps.sessions) {
      const id =
        runId ?? (await deps.sessions.list(userId)).find((r) => r.status === "complete")?.id;
      if (!id) return null;
      const saved = await deps.sessions.load(userId, id);
      return saved ? { id, replay: saved.replay } : null;
    }
    const id =
      runId ??
      (profileId
        ? (await deps.profiles?.listRuns(profileId))?.find((r) => r.complete)?.id
        : undefined);
    if (!id) return null;
    const saved = profileId ? await deps.profiles?.run(profileId, id) : null;
    return saved ? { id, replay: saved } : null;
  }

  async function loop({ req, prompt, followUp, sessionId, emit, ledger, signal }: Turn) {
    const tools = await deps.tools();
    const limit = followUp ? Math.min(maxSteps, FOLLOW_UP_STEPS) : maxSteps;
    const agent = new ToolLoopAgent({
      model,
      instructions: instructions(followUp),
      tools: {
        ...tools,
        // No execute: calling it ends the loop and carries the final answer.
        [ANSWER]: tool({
          description: "Submit the final investor matchups. Call once, at the end.",
          inputSchema: agentAnswerSchema,
        }),
      },
      stopWhen: [isStepCount(limit), hasToolCall(ANSWER)],
      // Last step: no more exploring, the agent must answer with what it has.
      prepareStep: ({ stepNumber }) =>
        stepNumber >= limit - 1 ? { toolChoice: { type: "tool", toolName: ANSWER } } : {},
      providerOptions: {
        google: {
          // Gemini 4 can't turn thinking off; "low" is its fastest level, and no summaries are sent.
          thinkingConfig: { thinkingLevel: "low", includeThoughts: false },
        } satisfies GoogleLanguageModelOptions,
      },
      telemetry: { functionId: "investor-matchup" },
    });

    const result = await agent.stream({
      prompt,
      abortSignal: signal,
    });

    let partialSent = false;
    const sendPartial = () => {
      if (partialSent || (!ledger.entities.size && !ledger.facts.size)) return;
      partialSent = true;
      const graph = partialGraph(ledger, {
        sessionId,
        companyId: req.companyId,
        companyName: req.name,
      });
      emit({ type: "done", graph });
    };

    try {
      let step = 0;
      for await (const part of result.fullStream) {
        switch (part.type) {
          case "start-step":
            emit({ type: "step", step: ++step });
            break;
          case "reasoning-delta":
            if (part.text) emit({ type: "thinking", id: `${step}:${part.id}`, text: part.text });
            break;
          case "tool-call":
            if (part.toolName === ANSWER) break;
            emit({
              type: "tool-call",
              id: part.toolCallId,
              tool: part.toolName,
              input: clip(JSON.stringify(part.input)),
            });
            break;
          case "tool-result": {
            const found = harvest(part.output);
            ledger.add(found);
            const failed = (part.output as { isError?: unknown } | null)?.isError === true;
            const lead = found.entities[0]?.name;
            const details = toolError(part.output);
            emit({
              type: "tool-result",
              id: part.toolCallId,
              tool: part.toolName,
              ok: !failed,
              summary: failed
                ? details
                  ? `Cala: ${details}`
                  : "Cala returned an error"
                : part.toolName === "entity_introspection"
                  ? "Schema read"
                  : found.entities.length
                    ? `${lead ? `${lead} · ` : ""}${found.entities.length} entities, ${found.facts.length} relations`
                    : "Nothing found",
              entities: found.entities.slice(0, MAX_EVENT_ITEMS),
              facts: found.facts.slice(0, MAX_EVENT_ITEMS),
            });
            break;
          }
          case "tool-error":
            emit({
              type: "tool-result",
              id: part.toolCallId,
              tool: part.toolName,
              ok: false,
              summary: clip(message(part.error), 160),
              entities: [],
              facts: [],
            });
            break;
          case "error":
            throw part.error;
        }
      }

      const call = (await result.toolCalls).find((c) => c.toolName === ANSWER);
      const parsed = agentAnswerSchema.safeParse(call?.input);
      if (!parsed.success) {
        throw new Error(
          call ? "The agent's answer was malformed" : "The agent stopped before answering",
        );
      }
      const answer = parsed.data;
      const graph = ground(answer, ledger, { sessionId, companyId: req.companyId });
      emit({ type: "done", graph });
      return graph;
    } catch (err) {
      sendPartial();
      throw err;
    }
  }

  return { run, last, modelId };
}
