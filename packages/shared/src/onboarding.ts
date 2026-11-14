import { z } from "zod";

/** Contracts for the founder onboarding flow (apps/webapp ↔ apps/api). */

// ---------- Requests ----------

export const companySearchQuerySchema = z.object({
  name: z.string({ error: "name is required" }).trim().min(1, "name is required").max(100),
});
export type CompanySearchQuery = z.infer<typeof companySearchQuerySchema>;

export const companyParamsSchema = z.object({
  id: z.uuid("id must be a UUID"),
});
export type CompanyParams = z.infer<typeof companyParamsSchema>;

// ---------- Facts and sources ----------

/** Cala's source ranks, strongest first. Anything else maps to OTHER. */
export const rankSchema = z.enum(["FILING", "PRIMARY", "PRESS", "AGGREGATOR", "OTHER"]);
export type Rank = z.infer<typeof rankSchema>;

export const citeSchema = z.object({
  name: z.string(),
  url: z.string().nullable(),
  date: z.string().nullable(),
  rank: rankSchema,
});
export type Cite = z.infer<typeof citeSchema>;

/** A value plus the sources that back it, strongest first. */
export const textFactSchema = z.object({
  value: z.string(),
  sources: z.array(citeSchema),
});
export type TextFact = z.infer<typeof textFactSchema>;

// ---------- Search ----------

export const companyMatchSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  hq: z.string().nullable(),
  website: z.string().nullable(),
});
export type CompanyMatch = z.infer<typeof companyMatchSchema>;

/** Founder-provided context used when Cala has no matching company record. */
export const manualCompanySchema = z.object({
  name: z.string().trim().min(1).max(120),
  website: z.string().trim().max(200).nullable(),
  hq: z.string().trim().max(120).nullable(),
  industry: z.string().trim().max(120).nullable(),
  stage: z.string().trim().max(80).nullable(),
  targetRound: z.string().trim().max(80).nullable(),
  targetAmount: z.string().trim().max(80).nullable(),
  /** Cala companies selected by the founder as relevant analogues. */
  similarCompanies: z.array(companyMatchSchema).max(5),
});
export type ManualCompany = z.infer<typeof manualCompanySchema>;

export const companyMatchesSchema = z.object({
  companies: z.array(companyMatchSchema),
});
export type CompanyMatches = z.infer<typeof companyMatchesSchema>;

// ---------- Profile ----------

export const backerSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** true = led, null = unknown (a missing is_lead is never "did not lead") */
  lead: z.literal(true).nullable(),
});
export type Backer = z.infer<typeof backerSchema>;

export const roundSchema = z.object({
  id: z.string(),
  label: z.string(),
  date: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  backers: z.array(backerSchema),
  sources: z.array(citeSchema),
});
export type Round = z.infer<typeof roundSchema>;

export const investorSchema = z.object({
  id: z.string(),
  /** Every Cala record merged into this one (same website) */
  ids: z.array(z.string()),
  name: z.string(),
  website: z.string().nullable(),
  /** Round labels this investor led; empty means lead status is unknown */
  led: z.array(z.string()),
  sources: z.array(citeSchema),
});
export type Investor = z.infer<typeof investorSchema>;

export const personSchema = z.object({
  id: z.string(),
  name: z.string(),
  roles: z.array(z.enum(["FOUNDER", "CEO"])),
  sources: z.array(citeSchema),
});
export type Person = z.infer<typeof personSchema>;

export const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  website: textFactSchema.nullable(),
  hq: textFactSchema.nullable(),
  founded: textFactSchema.nullable(),
  stage: textFactSchema.nullable(),
  industries: z.array(textFactSchema),
  rounds: z.array(roundSchema),
  investors: z.array(investorSchema),
  people: z.array(personSchema),
  /** Listed for Slush 2026 in Cala, with its sources */
  slush: z.object({ listed: z.boolean(), sources: z.array(citeSchema) }),
});
export type Profile = z.infer<typeof profileSchema>;

// ---------- Preferences ----------

export const founderPrefsSchema = z.object({
  round: z.array(z.string()),
  size: z.array(z.string()),
  geo: z.array(z.string()),
  lead: z.array(z.string()),
  sector: z.array(z.string()),
  timing: z.array(z.string()),
});
export type FounderPrefs = z.infer<typeof founderPrefsSchema>;

export const founderPreferencesStateSchema = z.object({
  companyId: z.uuid("companyId must be a UUID"),
  confirmed: z.boolean(),
  prefsDone: z.boolean(),
  prefs: founderPrefsSchema,
  updatedAt: z.string().nullable().optional(),
});
export type FounderPreferencesState = z.infer<typeof founderPreferencesStateSchema>;

export const upsertFounderPreferencesSchema = z.object({
  confirmed: z.boolean().default(true),
  prefsDone: z.boolean().default(false),
  prefs: founderPrefsSchema,
});
export type UpsertFounderPreferences = z.infer<typeof upsertFounderPreferencesSchema>;

// ---------- Users (Google OAuth via NextAuth) ----------

export const upsertUserSchema = z.object({
  id: z.string().trim().min(1),
  email: z.email(),
  name: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  companyId: z.uuid().nullable().optional(),
});
export type UpsertUser = z.infer<typeof upsertUserSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  companyId: z.uuid().nullable(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof userSchema>;
