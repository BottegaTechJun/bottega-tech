import { z } from "zod";
import { matchupReplaySchema } from "./matchup";
import { companyMatchSchema, profileSchema } from "./onboarding";
import { prefsSchema } from "./profiles";

/** The founder context captured when an investor search is started. */
export const searchSessionInputSchema = z.object({
  company: companyMatchSchema,
  facts: profileSchema.nullable(),
  prefs: prefsSchema,
});
export type SearchSessionInput = z.infer<typeof searchSessionInputSchema>;

export const searchSessionStatusSchema = z.enum(["running", "complete", "incomplete"]);
export type SearchSessionStatus = z.infer<typeof searchSessionStatusSchema>;

/** A saved investor search, including the replay used by the canvas. */
export const searchSessionSchema = z.object({
  id: z.string().min(1),
  input: searchSessionInputSchema,
  status: searchSessionStatusSchema,
  savedAt: z.string(),
  parentId: z.string().nullable(),
  replay: matchupReplaySchema,
});
export type SearchSession = z.infer<typeof searchSessionSchema>;

/** The history row shown in the sidebar. */
export const searchSessionSummarySchema = searchSessionSchema.omit({ replay: true }).extend({
  picks: z.number().int().nonnegative(),
  question: z.string().nullable(),
});
export type SearchSessionSummary = z.infer<typeof searchSessionSummarySchema>;

export const searchSessionListSchema = z.object({
  sessions: z.array(searchSessionSummarySchema),
});
export type SearchSessionList = z.infer<typeof searchSessionListSchema>;
