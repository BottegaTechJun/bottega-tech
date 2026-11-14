import {
  type MatchupReplay,
  matchupReplaySchema,
  type Profile,
  profileSchema,
  type SearchSession,
  type SearchSessionInput,
  type SearchSessionStatus,
  type SearchSessionSummary,
  searchSessionSchema,
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
 * - authenticated users (`users`)
 * - user-owned investor searches (`investor_search_sessions`)
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

CREATE TABLE IF NOT EXISTS investor_search_sessions (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'incomplete',
  parent_id TEXT,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replay JSONB NOT NULL DEFAULT '{"complete":false,"savedAt":"","events":[]}'::jsonb,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_investor_search_sessions_user_saved
  ON investor_search_sessions (user_id, saved_at DESC);
`;

export interface Database {
  /** Ensures all tables and indexes exist in Postgres. */
  migrate(): Promise<void>;
  /** Saves a normalized company profile and its rounds, investors, and people. */
  saveProfile(profile: Profile): Promise<void>;
  /** Loads a cached company profile by UUID if present. */
  loadProfile(companyId: string): Promise<{ profile: Profile; updatedAt: Date } | null>;
  /** Upserts an authenticated user (e.g. from Google OAuth). */
  saveUser(input: UpsertUser): Promise<User>;
  /** Saves one investor search under its authenticated owner. */
  saveSearchSession?(
    userId: string,
    id: string,
    input: SearchSessionInput,
    replay: MatchupReplay,
    parentId: string | null,
  ): Promise<void>;
  /** Lists only the authenticated user's investor searches. */
  listSearchSessions?(userId: string): Promise<SearchSessionSummary[]>;
  /** Loads one investor search only when it belongs to the authenticated user. */
  loadSearchSession?(userId: string, id: string): Promise<SearchSession | null>;
  /** Deletes one investor search only when it belongs to the authenticated user. */
  deleteSearchSession?(userId: string, id: string): Promise<boolean>;
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

const searchSessionRowSchema = z.looseObject({
  id: z.string(),
  input: z.unknown(),
  status: z.enum(["running", "complete", "incomplete"]),
  parent_id: z.string().nullable().optional(),
  saved_at: z.union([z.date(), z.string()]),
  replay: z.unknown(),
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

  async function saveSearchSession(
    userId: string,
    id: string,
    input: SearchSessionInput,
    replay: MatchupReplay,
    parentId: string | null,
  ): Promise<void> {
    await migrate();
    const status: SearchSessionStatus = replay.complete
      ? "complete"
      : replay.events.some((event) => event.type === "error")
        ? "incomplete"
        : "running";
    await sql`
      INSERT INTO investor_search_sessions (
        id, user_id, input, status, parent_id, saved_at, replay
      ) VALUES (
        ${id},
        ${userId},
        ${JSON.stringify(input)}::jsonb,
        ${status},
        ${parentId},
        ${replay.savedAt}::timestamptz,
        ${JSON.stringify(replay)}::jsonb
      )
      ON CONFLICT (user_id, id) DO UPDATE SET
        input = EXCLUDED.input,
        status = EXCLUDED.status,
        parent_id = EXCLUDED.parent_id,
        saved_at = EXCLUDED.saved_at,
        replay = EXCLUDED.replay
    `;
  }

  async function listSearchSessions(userId: string): Promise<SearchSessionSummary[]> {
    await migrate();
    const rows: unknown[] = await sql`
      SELECT id, input, status, parent_id, saved_at, replay
      FROM investor_search_sessions
      WHERE user_id = ${userId}
      ORDER BY saved_at DESC
    `;
    return rows.flatMap((raw) => {
      const row = searchSessionRowSchema.safeParse(raw);
      if (!row.success) return [];
      const replay = matchupReplaySchema.safeParse(parseJsonValue(row.data.replay));
      const input = searchSessionSchema.shape.input.safeParse(parseJsonValue(row.data.input));
      if (!replay.success || !input.success) return [];
      const done = replay.data.events.find((event) => event.type === "done");
      const followUp = replay.data.events.find((event) => event.type === "follow-up");
      return [
        {
          id: row.data.id,
          input: input.data,
          status: row.data.status,
          savedAt: toIsoString(row.data.saved_at),
          parentId: row.data.parent_id ?? null,
          picks: done?.type === "done" ? done.graph.investors.length : 0,
          question: followUp?.type === "follow-up" ? followUp.question : null,
        },
      ];
    });
  }

  async function loadSearchSession(userId: string, id: string): Promise<SearchSession | null> {
    await migrate();
    const rows: unknown[] = await sql`
      SELECT id, input, status, parent_id, saved_at, replay
      FROM investor_search_sessions
      WHERE id = ${id} AND user_id = ${userId}
      LIMIT 1
    `;
    const row = searchSessionRowSchema.safeParse(rows[0]);
    if (!row.success) return null;
    const parsed = searchSessionSchema.safeParse({
      id: row.data.id,
      input: parseJsonValue(row.data.input),
      status: row.data.status,
      savedAt: toIsoString(row.data.saved_at),
      parentId: row.data.parent_id ?? null,
      replay: parseJsonValue(row.data.replay),
    });
    return parsed.success ? parsed.data : null;
  }

  async function deleteSearchSession(userId: string, id: string): Promise<boolean> {
    await migrate();
    const rows: unknown[] = await sql`
      DELETE FROM investor_search_sessions
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `;
    return rows.length > 0;
  }

  return {
    migrate,
    saveProfile,
    loadProfile,
    saveUser,
    saveSearchSession,
    listSearchSessions,
    loadSearchSession,
    deleteSearchSession,
    close: () => sql.close(),
  };
}
