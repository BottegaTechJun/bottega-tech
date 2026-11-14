import { describe, expect, mock, test } from "bun:test";
import type { Profile } from "@repo/shared";
import { createCalaClient } from "../modules/cala/cala.client";
import { createOnboardingService } from "../modules/onboarding/onboarding.service";
import { createSearchSessionStore } from "../modules/searches/searches.service";
import { createDatabase, type Database, SCHEMA_SQL } from "./db";

const COMPANY_ID = "6ebd9536-fcc5-5921-8938-ce3497eb6262";

const sampleProfile: Profile = {
  id: COMPANY_ID,
  name: "In Parallel",
  description: "AI management platform",
  website: { value: "in-parallel.com", sources: [] },
  hq: { value: "Tampere, Finland", sources: [] },
  founded: { value: "2023-10-10", sources: [] },
  stage: { value: "SEED", sources: [] },
  industries: [{ value: "SOFTWARE", sources: [] }],
  rounds: [],
  investors: [],
  people: [],
  slush: { listed: true, sources: [] },
};

function createFakeDb(): Database {
  const profiles = new Map<string, { profile: Profile; updatedAt: Date }>();

  return {
    migrate: mock(async () => undefined),
    saveProfile: mock(async (profile: Profile) => {
      profiles.set(profile.id, { profile, updatedAt: new Date() });
    }),
    loadProfile: mock(async (id: string) => profiles.get(id) ?? null),
    saveUser: mock(async (input) => ({
      id: input.id,
      email: input.email,
      name: input.name ?? null,
      image: input.image ?? null,
      companyId: input.companyId ?? null,
      updatedAt: new Date().toISOString(),
    })),
    close: mock(async () => undefined),
  };
}

const input = {
  company: {
    id: COMPANY_ID,
    name: "In Parallel",
    description: "AI management platform",
    hq: "Tampere, Finland",
    website: "in-parallel.com",
  },
  facts: sampleProfile,
  prefs: { round: [], size: [], geo: [], lead: [], sector: [], timing: [] },
};

describe("database integration", () => {
  test("createDatabase returns null when DATABASE_URL is omitted", () => {
    expect(createDatabase(undefined)).toBeNull();
    expect(createDatabase("")).toBeNull();
  });

  test("SCHEMA_SQL contains public data, users, and owned search sessions", () => {
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS companies");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS funding_rounds");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS investors");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS company_investors");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS company_people");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS investor_search_sessions");
    expect(SCHEMA_SQL).toContain("user_id TEXT NOT NULL REFERENCES users(id)");
    expect(SCHEMA_SQL).not.toContain("CREATE TABLE IF NOT EXISTS matchup_runs");
    expect(SCHEMA_SQL).not.toContain("CREATE TABLE IF NOT EXISTS founder_preferences");
  });

  test("onboarding service reads cached public profiles without private preferences", async () => {
    const db = createFakeDb();
    await db.saveProfile(sampleProfile);

    const fetch = mock(async () => new Response("{}"));
    const service = createOnboardingService(createCalaClient({ apiKey: "k", fetch }), { db });

    const loaded = await service.getProfile(COMPANY_ID);
    expect(loaded.name).toBe("In Parallel");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("search sessions are isolated by user", async () => {
    const store = createSearchSessionStore(null);
    const replay = {
      complete: true,
      savedAt: "2026-11-14T16:00:00.000Z",
      events: [{ type: "step", step: 1 } as const],
    };

    await store.save("alice", "run-a", input, replay, null);
    await store.save("bob", "run-b", input, replay, null);

    expect((await store.list("alice")).map((session) => session.id)).toEqual(["run-a"]);
    expect((await store.list("bob")).map((session) => session.id)).toEqual(["run-b"]);
    expect(await store.load("bob", "run-a")).toBeNull();
    expect(await store.remove("bob", "run-a")).toBe(false);
  });
});
