import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import type {
  MatchupEvent,
  MatchupReplay,
  MatchupRequest,
  Prefs,
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
import { createLedger, ground, harvest } from "./matchup.graph";
import { agentAnswerSchema } from "./matchup.schemas";

const ANSWER = "submit_answer";
const SLUSH_2026 = "bc844d56-6ab4-452b-96bf-2661e86e592b";

const INSTRUCTIONS = `You match a startup with investors for its next round, using only Cala's knowledge graph tools.
Start from the company's funding rounds and current investors. Follow those investors' other rounds to find funds that led later rounds (Series A and up) of similar companies, and how they connect to the company's investors: shared rounds, co-investments, people, events (Slush 2026 is ${SLUSH_2026}).
When the company says what it wants next, prefer investors that fit it.
Rules: use only ids and source URLs that appear in tool results. A missing is_lead means unknown, never "did not lead". State what happened, never predict intent. Suggest at most 5 investors.
Work fast: about 10 to 15 tool calls, several at once when they don't depend on each other. Then call ${ANSWER} once with your answer.`;

const MAX_EVENT_ITEMS = 60;

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
}

export interface ProfileRuns {
  get(id: string): Promise<SavedProfile | null>;
  addRun(id: string, name: string, run: MatchupReplay): Promise<string>;
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

/** The user prompt: the company, a few known facts, and what it wants next. */
export function brief(req: MatchupRequest, profile: SavedProfile | null): string {
  const facts = profile?.facts;
  const known = [
    facts?.hq?.value && `HQ ${facts.hq.value}`,
    facts?.stage?.value && `stage ${facts.stage.value}`,
    facts?.investors.length && `investors ${facts.investors.map((i) => i.name).join(", ")}`,
  ].filter(Boolean);
  return [
    `Company: ${req.name} (Cala id ${req.companyId}).${known.length ? ` Known: ${known.join("; ")}.` : ""}`,
    profile ? wants(profile.prefs) : "",
    "Find the right investors for its next round and how they connect.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function createMatchupService(deps: MatchupDeps) {
  const { model, modelId, maxSteps = 16 } = deps;

  /** Runs one lookup and emits its progress. Never throws; failures become an `error` event. */
  async function run(req: MatchupRequest, send: Emit, signal?: AbortSignal): Promise<void> {
    const events: MatchupEvent[] = [];
    const emit: Emit = (event) => {
      events.push(event);
      send(event);
    };
    const sessionId = req.sessionId ?? `warmup-${crypto.randomUUID()}`;
    const profile = req.profileId ? ((await deps.profiles?.get(req.profileId)) ?? null) : null;
    emit({
      type: "start",
      sessionId,
      model: modelId,
      traceUrl: deps.sessionUrl?.(sessionId) ?? null,
    });

    await startActiveObservation(
      "investor-matchup",
      (root) =>
        propagateAttributes(
          {
            sessionId,
            traceName: "investor-matchup",
            tags: req.profileId ? ["matchup", `profile:${req.profileId}`] : ["matchup"],
            metadata: {
              companyId: req.companyId,
              model: modelId,
              ...(req.profileId ? { profileId: req.profileId } : {}),
            },
          },
          async () => {
            const prompt = brief(req, profile);
            root.update({ input: { companyId: req.companyId, profileId: req.profileId, prompt } });
            try {
              if (req.profileId && !profile) throw new Error("No saved profile with this id");
              const graph = await loop(req, prompt, sessionId, emit, signal);
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
    await deps.after?.().catch(() => undefined);
    await keep(req, profile, sessionId, events).catch((err) =>
      console.error("Saving run failed", err),
    );
  }

  /**
   * A profile's runs are all kept, side by side. Without a profile, a finished run replaces
   * the company's saved one and a partial run is kept only when nothing finished.
   */
  async function keep(
    req: MatchupRequest,
    profile: SavedProfile | null,
    sessionId: string,
    events: MatchupEvent[],
  ) {
    if (!events.some((e) => e.type === "tool-result" || e.type === "done")) return;
    const complete = events.some((e) => e.type === "done");
    const savedAt = new Date().toISOString();
    if (profile) {
      await deps.profiles?.addRun(profile.id, sessionId, { complete, savedAt, events });
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

  async function loop(
    req: MatchupRequest,
    prompt: string,
    sessionId: string,
    emit: Emit,
    signal?: AbortSignal,
  ) {
    const ledger = createLedger();
    const tools = await deps.tools();
    const agent = new ToolLoopAgent({
      model,
      instructions: INSTRUCTIONS,
      tools: {
        ...tools,
        // No execute: calling it ends the loop and carries the final answer.
        [ANSWER]: tool({
          description: "Submit the final investor matchups. Call once, at the end.",
          inputSchema: agentAnswerSchema,
        }),
      },
      stopWhen: [isStepCount(maxSteps), hasToolCall(ANSWER)],
      // Last step: no more exploring, the agent must answer with what it has.
      prepareStep: ({ stepNumber }) =>
        stepNumber >= maxSteps - 1 ? { toolChoice: { type: "tool", toolName: ANSWER } } : {},
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
          emit({
            type: "tool-result",
            id: part.toolCallId,
            tool: part.toolName,
            ok: !failed,
            summary: failed
              ? "Cala returned an error"
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
  }

  return { run, last, modelId };
}
