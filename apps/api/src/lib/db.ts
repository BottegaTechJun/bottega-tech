import {
  type FounderPreferencesState,
  founderPreferencesStateSchema,
  founderPrefsSchema,
  type MatchupReplay,
  matchupReplaySchema,
  type Profile,
  profileSchema,
  type UpsertFounderPreferences,
  type UpsertUser,
  type User,
} from "@repo/shared";
import { SQL } from "bun";
import { z } from "zod";

/**
 * Relational PostgreSQL schema for Bottega (Aiven Postgres).
 * Covers:
 * - companies & sourced profiles (`companies`)
 * - normalized funding rounds (`funding_rounds`)
 * - normalized investors & company-investor links (`investors`, `company_investors`)
 * - company leadership (`company_people`)
 * - founder onboarding preferences (`founder_preferences`)
 * - investor matchup agent runs & history (`matchup_runs`, `matchup_run_history`)
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  hq TEXT,
  founded TEXT,
  stage TEXT,
  slush_listed BOOLEAN NOT NULL DEFAULT FALSE,
  profile JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_name_lower ON companies (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_companies_updated_at ON companies (updated_at DESC);

CREATE TABLE IF NOT EXISTS funding_rounds (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  round_date TEXT,
  amount DOUBLE PRECISION,
  currency TEXT,
  backers JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funding_rounds_company_id ON funding_rounds (company_id);

CREATE TABLE IF NOT EXISTS investors (
  id TEXT PRIMARY KEY,
  merged_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  name TEXT NOT NULL,
  website TEXT,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investors_website ON investors (website) WHERE website IS NOT NULL;

CREATE TABLE IF NOT EXISTS company_investors (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  investor_id TEXT NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  led_rounds JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, investor_id)
);

CREATE INDEX IF NOT EXISTS idx_company_investors_investor_id ON company_investors (investor_id);

CREATE TABLE IF NOT EXISTS company_people (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL,
  name TEXT NOT NULL,
  roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, person_id)
);

CREATE TABLE IF NOT EXISTS founder_preferences (
  company_id UUID PRIMARY KEY,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  prefs_done BOOLEAN NOT NULL DEFAULT FALSE,
  round JSONB NOT NULL DEFAULT '[]'::jsonb,
  size JSONB NOT NULL DEFAULT '[]'::jsonb,
  geo JSONB NOT NULL DEFAULT '[]'::jsonb,
  lead JSONB NOT NULL DEFAULT '[]'::jsonb,
  sector JSONB NOT NULL DEFAULT '[]'::jsonb,
  timing JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matchup_runs (
  company_id UUID PRIMARY KEY,
  session_id TEXT,
  model TEXT,
  complete BOOLEAN NOT NULL DEFAULT FALSE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  graph JSONB,
  events JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS matchup_run_history (
  session_id TEXT PRIMARY KEY,
  company_id UUID NOT NULL,
  model TEXT,
  complete BOOLEAN NOT NULL DEFAULT FALSE,
  summary TEXT,
  dropped INTEGER NOT NULL DEFAULT 0,
  graph JSONB,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matchup_run_history_company_id
  ON matchup_run_history (company_id, saved_at DESC);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  image TEXT,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
`;

export interface Database {
  /** Ensures all tables and indexes exist in Postgres. */
  migrate(): Promise<void>;
  /** Saves a normalized company profile and its rounds, investors, and people. */
  saveProfile(profile: Profile): Promise<void>;
  /** Loads a cached company profile by UUID if present. */
  loadProfile(companyId: string): Promise<{ profile: Profile; updatedAt: Date } | null>;
  /** Loads founder onboarding preferences for a company. */
  loadPreferences(companyId: string): Promise<FounderPreferencesState | null>;
  /** Upserts founder onboarding preferences for a company. */
  savePreferences(
    companyId: string,
    input: UpsertFounderPreferences,
  ): Promise<FounderPreferencesState>;
  /** Upserts an authenticated user (e.g. from Google OAuth). */
  saveUser(input: UpsertUser): Promise<User>;
  /** Loads the latest saved matchup replay for a company. */
  loadMatchupRun(companyId: string): Promise<MatchupReplay | null>;
  /** Saves a matchup replay (latest per company + run history). */
  saveMatchupRun(companyId: string, run: MatchupReplay): Promise<void>;
  /** Closes the underlying connection pool. */
  close(): Promise<void>;
}

function parseJsonValue(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

const companyProfileRowSchema = z.looseObject({
  profile: z.unknown(),
  updated_at: z.union([z.date(), z.string()]),
});

const preferencesRowSchema = z.looseObject({
  company_id: z.string(),
  confirmed: z.boolean(),
  prefs_done: z.boolean(),
  round: z.unknown(),
  size: z.unknown(),
  geo: z.unknown(),
  lead: z.unknown(),
  sector: z.unknown(),
  timing: z.unknown(),
  updated_at: z.union([z.date(), z.string()]).optional(),
});

const matchupRunRowSchema = z.looseObject({
  complete: z.boolean(),
  saved_at: z.union([z.date(), z.string()]),
  events: z.unknown(),
});

function toIsoString(val: Date | string | undefined): string {
  if (!val) return new Date().toISOString();
  return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
}

/**
 * Creates a Postgres client backed by Bun's native SQL driver (configured for Aiven TLS).
 * Returns `null` when `databaseUrl` is omitted.
 */
export function createDatabase(databaseUrl?: string): Database | null {
  if (!databaseUrl) return null;

  const sql = new SQL(databaseUrl, {
    tls: { rejectUnauthorized: false },
  });

  return createSqlDatabase(sql);
}

/** Builds a `Database` instance from a Bun `SQL` client (exported for testing). */
export function createSqlDatabase(sql: SQL): Database {
  let migrated: Promise<void> | null = null;

  function migrate(): Promise<void> {
    if (!migrated) {
      migrated = (async () => {
        await sql.unsafe(SCHEMA_SQL);
      })().catch((err) => {
        migrated = null;
        throw err;
      });
    }
    return migrated;
  }

  async function saveProfile(profile: Profile): Promise<void> {
    await migrate();
    const website = profile.website?.value ?? null;
    const hq = profile.hq?.value ?? null;
    const founded = profile.founded?.value ?? null;
    const stage = profile.stage?.value ?? null;
    const slushListed = profile.slush.listed;
    const profileJson = JSON.stringify(profile);

    await sql`
      INSERT INTO companies (
        id, name, description, website, hq, founded, stage, slush_listed, profile, updated_at
      ) VALUES (
        ${profile.id}::uuid,
        ${profile.name},
        ${profile.description},
        ${website},
        ${hq},
        ${founded},
        ${stage},
        ${slushListed},
        ${profileJson}::jsonb,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        website = EXCLUDED.website,
        hq = EXCLUDED.hq,
        founded = EXCLUDED.founded,
        stage = EXCLUDED.stage,
        slush_listed = EXCLUDED.slush_listed,
        profile = EXCLUDED.profile,
        updated_at = NOW()
    `;

    for (const round of profile.rounds) {
      await sql`
        INSERT INTO funding_rounds (
          id, company_id, label, round_date, amount, currency, backers, sources, updated_at
        ) VALUES (
          ${round.id},
          ${profile.id}::uuid,
          ${round.label},
          ${round.date},
          ${round.amount},
          ${round.currency},
          ${JSON.stringify(round.backers)}::jsonb,
          ${JSON.stringify(round.sources)}::jsonb,
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          company_id = EXCLUDED.company_id,
          label = EXCLUDED.label,
          round_date = EXCLUDED.round_date,
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          backers = EXCLUDED.backers,
          sources = EXCLUDED.sources,
          updated_at = NOW()
      `;
    }

    for (const investor of profile.investors) {
      await sql`
        INSERT INTO investors (
          id, merged_ids, name, website, sources, updated_at
        ) VALUES (
          ${investor.id},
          ${JSON.stringify(investor.ids)}::jsonb,
          ${investor.name},
          ${investor.website},
          ${JSON.stringify(investor.sources)}::jsonb,
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          merged_ids = EXCLUDED.merged_ids,
          name = EXCLUDED.name,
          website = EXCLUDED.website,
          sources = EXCLUDED.sources,
          updated_at = NOW()
      `;

      await sql`
        INSERT INTO company_investors (
          company_id, investor_id, led_rounds, sources, updated_at
        ) VALUES (
          ${profile.id}::uuid,
          ${investor.id},
          ${JSON.stringify(investor.led)}::jsonb,
          ${JSON.stringify(investor.sources)}::jsonb,
          NOW()
        )
        ON CONFLICT (company_id, investor_id) DO UPDATE SET
          led_rounds = EXCLUDED.led_rounds,
          sources = EXCLUDED.sources,
          updated_at = NOW()
      `;
    }

    for (const person of profile.people) {
      await sql`
        INSERT INTO company_people (
          company_id, person_id, name, roles, sources, updated_at
        ) VALUES (
          ${profile.id}::uuid,
          ${person.id},
          ${person.name},
          ${JSON.stringify(person.roles)}::jsonb,
          ${JSON.stringify(person.sources)}::jsonb,
          NOW()
        )
        ON CONFLICT (company_id, person_id) DO UPDATE SET
          name = EXCLUDED.name,
          roles = EXCLUDED.roles,
          sources = EXCLUDED.sources,
          updated_at = NOW()
      `;
    }
  }

  async function loadProfile(
    companyId: string,
  ): Promise<{ profile: Profile; updatedAt: Date } | null> {
    await migrate();
    const rows: unknown[] = await sql`
      SELECT profile, updated_at
      FROM companies
      WHERE id = ${companyId}::uuid
      LIMIT 1
    `;
    const row = companyProfileRowSchema.safeParse(rows[0]);
    if (!row.success) return null;

    const parsedProfile = profileSchema.safeParse(parseJsonValue(row.data.profile));
    if (!parsedProfile.success) return null;

    const updatedAt =
      row.data.updated_at instanceof Date ? row.data.updated_at : new Date(row.data.updated_at);
    return { profile: parsedProfile.data, updatedAt };
  }

  async function loadPreferences(companyId: string): Promise<FounderPreferencesState | null> {
    await migrate();
    const rows: unknown[] = await sql`
      SELECT company_id, confirmed, prefs_done, round, size, geo, lead, sector, timing, updated_at
      FROM founder_preferences
      WHERE company_id = ${companyId}::uuid
      LIMIT 1
    `;
    const row = preferencesRowSchema.safeParse(rows[0]);
    if (!row.success) return null;

    const prefsParsed = founderPrefsSchema.safeParse({
      round: parseJsonValue(row.data.round),
      size: parseJsonValue(row.data.size),
      geo: parseJsonValue(row.data.geo),
      lead: parseJsonValue(row.data.lead),
      sector: parseJsonValue(row.data.sector),
      timing: parseJsonValue(row.data.timing),
    });
    if (!prefsParsed.success) return null;

    const stateParsed = founderPreferencesStateSchema.safeParse({
      companyId: row.data.company_id,
      confirmed: row.data.confirmed,
      prefsDone: row.data.prefs_done,
      prefs: prefsParsed.data,
      updatedAt: toIsoString(row.data.updated_at),
    });
    return stateParsed.success ? stateParsed.data : null;
  }

  async function savePreferences(
    companyId: string,
    input: UpsertFounderPreferences,
  ): Promise<FounderPreferencesState> {
    await migrate();
    const { confirmed, prefsDone, prefs } = input;
    const rows: unknown[] = await sql`
      INSERT INTO founder_preferences (
        company_id, confirmed, prefs_done, round, size, geo, lead, sector, timing, updated_at
      ) VALUES (
        ${companyId}::uuid,
        ${confirmed},
        ${prefsDone},
        ${JSON.stringify(prefs.round)}::jsonb,
        ${JSON.stringify(prefs.size)}::jsonb,
        ${JSON.stringify(prefs.geo)}::jsonb,
        ${JSON.stringify(prefs.lead)}::jsonb,
        ${JSON.stringify(prefs.sector)}::jsonb,
        ${JSON.stringify(prefs.timing)}::jsonb,
        NOW()
      )
      ON CONFLICT (company_id) DO UPDATE SET
        confirmed = EXCLUDED.confirmed,
        prefs_done = EXCLUDED.prefs_done,
        round = EXCLUDED.round,
        size = EXCLUDED.size,
        geo = EXCLUDED.geo,
        lead = EXCLUDED.lead,
        sector = EXCLUDED.sector,
        timing = EXCLUDED.timing,
        updated_at = NOW()
      RETURNING updated_at
    `;
    const first = z.looseObject({ updated_at: z.union([z.date(), z.string()]) }).safeParse(rows[0]);
    return {
      companyId,
      confirmed,
      prefsDone,
      prefs,
      updatedAt: first.success ? toIsoString(first.data.updated_at) : new Date().toISOString(),
    };
  }

  async function saveUser(input: UpsertUser): Promise<User> {
    await migrate();
    const name = input.name ?? null;
    const image = input.image ?? null;
    const companyId = input.companyId ?? null;

    const rows: unknown[] = await sql`
      INSERT INTO users (
        id, email, name, image, company_id, updated_at
      ) VALUES (
        ${input.id},
        ${input.email},
        ${name},
        ${image},
        ${companyId}::uuid,
        NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        id = EXCLUDED.id,
        name = COALESCE(EXCLUDED.name, users.name),
        image = COALESCE(EXCLUDED.image, users.image),
        company_id = COALESCE(EXCLUDED.company_id, users.company_id),
        updated_at = NOW()
      RETURNING updated_at, company_id
    `;
    const first = z
      .looseObject({
        updated_at: z.union([z.date(), z.string()]),
        company_id: z.string().nullable().optional(),
      })
      .safeParse(rows[0]);
    return {
      id: input.id,
      email: input.email,
      name,
      image,
      companyId: first.success ? (first.data.company_id ?? companyId) : companyId,
      updatedAt: first.success ? toIsoString(first.data.updated_at) : new Date().toISOString(),
    };
  }

  async function loadMatchupRun(companyId: string): Promise<MatchupReplay | null> {
    await migrate();
    const rows: unknown[] = await sql`
      SELECT complete, saved_at, events
      FROM matchup_runs
      WHERE company_id = ${companyId}::uuid
      LIMIT 1
    `;
    const row = matchupRunRowSchema.safeParse(rows[0]);
    if (!row.success) return null;

    const parsed = matchupReplaySchema.safeParse({
      complete: row.data.complete,
      savedAt: toIsoString(row.data.saved_at),
      events: parseJsonValue(row.data.events),
    });
    return parsed.success ? parsed.data : null;
  }

  async function saveMatchupRun(companyId: string, run: MatchupReplay): Promise<void> {
    await migrate();
    const startEvent = run.events.find((e) => e.type === "start");
    const doneEvent = run.events.find((e) => e.type === "done");
    const sessionId = startEvent?.sessionId ?? doneEvent?.graph.sessionId ?? null;
    const model = startEvent?.model ?? null;
    const graph = doneEvent?.graph ?? null;
    const eventsJson = JSON.stringify(run.events);
    const graphJson = graph ? JSON.stringify(graph) : null;

    await sql`
      INSERT INTO matchup_runs (
        company_id, session_id, model, complete, saved_at, graph, events
      ) VALUES (
        ${companyId}::uuid,
        ${sessionId},
        ${model},
        ${run.complete},
        ${run.savedAt}::timestamptz,
        ${graphJson}::jsonb,
        ${eventsJson}::jsonb
      )
      ON CONFLICT (company_id) DO UPDATE SET
        session_id = EXCLUDED.session_id,
        model = EXCLUDED.model,
        complete = EXCLUDED.complete,
        saved_at = EXCLUDED.saved_at,
        graph = EXCLUDED.graph,
        events = EXCLUDED.events
    `;

    if (sessionId) {
      await sql`
        INSERT INTO matchup_run_history (
          session_id, company_id, model, complete, summary, dropped, graph, events, saved_at
        ) VALUES (
          ${sessionId},
          ${companyId}::uuid,
          ${model},
          ${run.complete},
          ${graph?.summary ?? null},
          ${graph?.dropped ?? 0},
          ${graphJson}::jsonb,
          ${eventsJson}::jsonb,
          ${run.savedAt}::timestamptz
        )
        ON CONFLICT (session_id) DO UPDATE SET
          complete = EXCLUDED.complete,
          summary = EXCLUDED.summary,
          dropped = EXCLUDED.dropped,
          graph = EXCLUDED.graph,
          events = EXCLUDED.events,
          saved_at = EXCLUDED.saved_at
      `;
    }
  }

  return {
    migrate,
    saveProfile,
    loadProfile,
    loadPreferences,
    savePreferences,
    saveUser,
    loadMatchupRun,
    saveMatchupRun,
    close: () => sql.close(),
  };
}
