import { connectionKindSchema } from "@repo/shared";
import { z } from "zod";
import { citeSchema } from "../onboarding/onboarding.schemas";

/** What the agent must return at the end of its run. The service grounds it before use. */
export const agentAnswerSchema = z.object({
  summary: z.string().describe("Two or three sentences: who to approach first and why"),
  investors: z
    .array(
      z.object({
        id: z.string().describe("Cala entity id of a suggested investor, from a tool result"),
        why: z.string().describe("One sentence on why this investor fits"),
        // Tolerant on purpose: a missing list must not fail the run, grounding fills it in.
        evidence: z
          .array(z.string())
          .default([])
          .describe("One to four source URLs, copied from tool results, that back this pick"),
      }),
    )
    .max(5),
  connections: z.array(
    z.object({
      from: z.string().describe("Cala entity id"),
      to: z.string().describe("Cala entity id"),
      via: z.array(z.string()).describe("Entity ids the link runs through, e.g. a shared round"),
      kind: connectionKindSchema,
      label: z.string().describe("Two to five words, e.g. 'Co-invested in Series A'"),
      reasoning: z.string().describe("Why these two are connected and why it matters"),
      factors: z.array(z.string()).describe("Short connecting factors"),
      evidence: z.array(z.string()).describe("Source document URLs copied from tool results"),
    }),
  ),
});
export type AgentAnswer = z.infer<typeof agentAnswerSchema>;

/*
 * Tolerant views of Cala MCP results, used to harvest entities and relationships.
 * Unknown fields pass through.
 */

export const rawEntitySchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  entity_type: z.string(),
});

export const rawLinkSchema = z.looseObject({
  id: z.string(),
  name: z.string().nullish(),
  entity_type: z.string().nullish(),
  properties: z
    .looseObject({
      role: z.string().nullish(),
      is_lead: z.boolean().nullish(),
      sources: z.array(citeSchema).default([]),
    })
    .nullish(),
});

/** One source of a knowledge_search answer: `context[].origins[]`. Search results carry no date. */
export const rawOriginSchema = z.looseObject({
  document: z.looseObject({ url: z.string() }),
});

export const rawRetrievalSchema = z.looseObject({
  id: z.string(),
  relationships: z.looseObject({
    outgoing: z.record(z.string(), z.array(z.unknown())).default({}),
    incoming: z.record(z.string(), z.array(z.unknown())).default({}),
  }),
});
