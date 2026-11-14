import { z } from "zod";
import { companyMatchSchema, profileSchema } from "./onboarding";

/** Contracts for saved profiles: who the company is and what it wants next. */

// ---------- Preferences ----------

const answers = z.array(z.string().max(100)).max(20);

/** The onboarding preference answers (apps/webapp/src/lib/prefs.ts holds the questions). */
export const prefsSchema = z.object({
  round: answers,
  size: answers,
  geo: answers,
  lead: answers,
  sector: answers,
  timing: answers,
});
export type Prefs = z.infer<typeof prefsSchema>;

// ---------- Requests ----------

export const profileParamsSchema = z.object({
  id: z.uuid("id must be a UUID"),
});
export type ProfileParams = z.infer<typeof profileParamsSchema>;

export const runParamsSchema = z.object({
  id: z.uuid("id must be a UUID"),
  run: z
    .string()
    .regex(/^[\w.-]{1,100}$/, "run may only hold letters, digits, dot, dash, underscore"),
});
export type RunParams = z.infer<typeof runParamsSchema>;

/** Body of create and update: the confirmed company, its facts and the preferences. */
export const profileInputSchema = z.object({
  company: companyMatchSchema,
  facts: profileSchema.nullable(),
  prefs: prefsSchema,
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

// ---------- Responses ----------

export const savedProfileSchema = profileInputSchema.extend({
  id: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedProfile = z.infer<typeof savedProfileSchema>;

/** A profile in the sidebar list: no facts, those are only loaded on open. */
export const profileSummarySchema = savedProfileSchema.omit({ facts: true });
export type ProfileSummary = z.infer<typeof profileSummarySchema>;

export const profileListSchema = z.object({ profiles: z.array(profileSummarySchema) });
export type ProfileList = z.infer<typeof profileListSchema>;

/** One saved matchup run of a profile. `id` is its file name, usually the session id. */
export const runSummarySchema = z.object({
  id: z.string(),
  sessionId: z.string().nullable(),
  savedAt: z.string(),
  complete: z.boolean(),
  picks: z.number().int().nonnegative(),
  /** The follow-up question when this run revised another one */
  question: z.string().nullable(),
  /** The run it revised */
  parent: z.string().nullable(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

/** Newest first. */
export const runListSchema = z.object({ runs: z.array(runSummarySchema) });
export type RunList = z.infer<typeof runListSchema>;
