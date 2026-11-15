import { z } from "zod";
import { citeSchema } from "./onboarding";
import { profileInputSchema } from "./profiles";

/** Contracts for the investor matchup agent (apps/webapp ↔ apps/api). */

// ---------- Request ----------

const slug = (field: string) =>
  z
    .string()
    .regex(/^[\w.-]{1,100}$/, `${field} may only hold letters, digits, dot, dash, underscore`);

/** A question on top of a finished profile run; the agent revises that run's answer. */
export const followUpSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "question is too short")
    .max(300, "question is too long (300 characters max)"),
  /** The profile run to build on; the newest finished run when missing */
  parent: slug("parent").optional(),
});
export type FollowUp = z.infer<typeof followUpSchema>;

export const matchupRequestSchema = z
  .object({
    companyId: z.uuid("companyId must be a UUID"),
    name: z.string().trim().min(1, "name is required").max(200),
    /** Saved profile to run for: its company and preferences shape the search, the run is kept under it */
    profileId: z.uuid("profileId must be a UUID").optional(),
    /** Founder context sent with a search; persisted as part of the user-owned search session. */
    profile: profileInputSchema.optional(),
    /** Optional Langfuse session id; the API makes one when missing */
    sessionId: slug("sessionId").optional(),
    followUp: followUpSchema.optional(),
  })
  .refine((req) => !req.followUp || req.profileId || req.profile, {
    path: ["followUp"],
    message: "Follow-ups need a profile or profileId",
  });
export type MatchupRequest = z.infer<typeof matchupRequestSchema>;

// ---------- Graph ----------

export const roleSchema = z.enum(["company", "investor", "round", "person", "event", "other"]);
export type Role = z.infer<typeof roleSchema>;

/** An entity seen in a Cala tool result. Name and type always come from Cala, never the model. */
export const entitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  role: roleSchema,
});
export type Entity = z.infer<typeof entitySchema>;

/** One raw relationship exactly as Cala returned it. */
export const factSchema = z.object({
  from: z.string(),
  to: z.string(),
  relation: z.string(),
  role: z.string().nullable(),
  /** true = led, null = unknown (a missing is_lead is never "did not lead") */
  lead: z.literal(true).nullable(),
  sources: z.array(citeSchema),
});
export type Fact = z.infer<typeof factSchema>;

export const connectionKindSchema = z.enum([
  "co_invested",
  "led",
  "invested",
  "people",
  "event",
  "other",
]);
export type ConnectionKind = z.infer<typeof connectionKindSchema>;

/** A reasoned link between two entities, with the facts and sources that back it. */
export const connectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  /** Entities the link runs through, e.g. the round both investors joined */
  via: z.array(z.string()),
  kind: connectionKindSchema,
  label: z.string(),
  reasoning: z.string(),
  factors: z.array(z.string()),
  evidence: z.array(citeSchema),
  facts: z.array(factSchema),
});
export type Connection = z.infer<typeof connectionSchema>;

export const pickSchema = z.object({
  id: z.string(),
  why: z.string(),
  /**
   * Sources behind the pick, all from the run's tool results: the ones the agent cited, or the
   * sourced records of what the investor backed. Empty only in runs saved before picks had them.
   */
  evidence: z.array(citeSchema).default([]),
});
export type Pick = z.infer<typeof pickSchema>;

export const matchupGraphSchema = z.object({
  sessionId: z.string(),
  companyId: z.string(),
  summary: z.string(),
  entities: z.array(entitySchema),
  investors: z.array(pickSchema),
  connections: z.array(connectionSchema),
  /** Items the model returned that no tool result backs; removed from the graph */
  dropped: z.number().int().nonnegative(),
});
export type MatchupGraph = z.infer<typeof matchupGraphSchema>;

// ---------- Stream events (Server-Sent Events, one JSON object per `data:` line) ----------

export const matchupEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    sessionId: z.string(),
    model: z.string(),
    traceUrl: z.string().nullable(),
  }),
  z.object({ type: z.literal("step"), step: z.number().int() }),
  z.object({ type: z.literal("thinking"), id: z.string(), text: z.string() }),
  z.object({ type: z.literal("tool-call"), id: z.string(), tool: z.string(), input: z.string() }),
  z.object({
    type: z.literal("tool-result"),
    id: z.string(),
    tool: z.string(),
    summary: z.string(),
    ok: z.boolean(),
    entities: z.array(entitySchema),
    facts: z.array(factSchema),
  }),
  /** A follow-up run starts from its parent: the question and what the parent saw in Cala */
  z.object({
    type: z.literal("follow-up"),
    question: z.string(),
    parent: z.string(),
    entities: z.array(entitySchema),
    facts: z.array(factSchema),
  }),
  z.object({ type: z.literal("done"), graph: matchupGraphSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type MatchupEvent = z.infer<typeof matchupEventSchema>;

/** `POST /api/matchup` answer: the background run to read events from. */
export const matchupStartedSchema = z.object({ runId: z.string() });
export type MatchupStarted = z.infer<typeof matchupStartedSchema>;

/** The last saved run for a company, replayed instead of running the agent again. */
export const matchupReplaySchema = z.object({
  complete: z.boolean(),
  savedAt: z.string(),
  events: z.array(matchupEventSchema),
});
export type MatchupReplay = z.infer<typeof matchupReplaySchema>;
