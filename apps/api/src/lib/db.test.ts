import { describe, expect, mock, test } from "bun:test";
import type { MatchupReplay, Profile } from "@repo/shared";
import { createCalaClient } from "../modules/cala/cala.client";
import { createDatabaseRunStore } from "../modules/matchup/matchup.store";
import { createOnboardingService } from "../modules/onboarding/onboarding.service";
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
  rounds: [
    {
      id: "81a35997-c8e2-59de-8a9f-021d97e4f6a9",
      label: "SEED",
      date: "2024-11-12",
      amount: null,
      currency: "EUR",
      backers: [{ id: "lv1", name: "Lifeline Ventures", lead: true }],
      sources: [],
    },
  ],
  investors: [
    {
      id: "lv1",
      ids: ["lv1"],
      name: "Lifeline Ventures",
      website: "lifelineventures.com",
      led: ["SEED"],
      sources: [],
    },
  ],
  people: [{ id: "p1", name: "Markku", roles: ["CEO", "FOUNDER"], sources: [] }],
  slush: { listed: true, sources: [] },
};

function createFakeDb(): Database {
  const profiles = new Map<string, { profile: Profile; updatedAt: Date }>();
  const prefs = new Map<
    string,
    {
      companyId: string;
      confirmed: boolean;
      prefsDone: boolean;
      prefs: {
        round: string[];
        size: string[];
        geo: string[];
        lead: string[];
        sector: string[];
        timing: string[];
      };
      updatedAt: string;
    }
  >();
  const runs = new Map<string, MatchupReplay>();

  return {
    migrate: mock(async () => undefined),
    saveProfile: mock(async (profile: Profile) => {
      profiles.set(profile.id, { profile, updatedAt: new Date() });
    }),
    loadProfile: mock(async (id: string) => profiles.get(id) ?? null),
    loadPreferences: mock(async (id: string) => prefs.get(id) ?? null),
    savePreferences: mock(async (id, input) => {
      const state = {
        companyId: id,
        confirmed: input.confirmed,
        prefsDone: input.prefsDone,
        prefs: input.prefs,
        updatedAt: new Date().toISOString(),
      };
      prefs.set(id, state);
      return state;
    }),
    saveUser: mock(async (input) => ({
      id: input.id,
      email: input.email,
      name: input.name ?? null,
      image: input.image ?? null,
      companyId: input.companyId ?? null,
      updatedAt: new Date().toISOString(),
    })),
    loadMatchupRun: mock(async (id: string) => runs.get(id) ?? null),
    saveMatchupRun: mock(async (id: string, run: MatchupReplay) => {
      runs.set(id, run);
    }),
    close: mock(async () => undefined),
  };
}

describe("database integration", () => {
  test("createDatabase returns null when DATABASE_URL is omitted", () => {
    expect(createDatabase(undefined)).toBeNull();
    expect(createDatabase("")).toBeNull();
  });

  test("SCHEMA_SQL defines all required domain tables", () => {
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS companies");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS funding_rounds");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS investors");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS company_investors");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS company_people");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS founder_preferences");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS matchup_runs");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS matchup_run_history");
  });

  test("onboarding service reads cached profiles and saves preferences via Database", async () => {
    const db = createFakeDb();
    await db.saveProfile(sampleProfile);

    const fetch = mock(async () => new Response("{}"));
    const service = createOnboardingService(createCalaClient({ apiKey: "k", fetch }), { db });

    // Reads from db without calling Cala upstream
    const loaded = await service.getProfile(COMPANY_ID);
    expect(loaded.name).toBe("In Parallel");
    expect(fetch).not.toHaveBeenCalled();

    // Saves and retrieves founder preferences
    const saved = await service.savePreferences(COMPANY_ID, {
      confirmed: true,
      prefsDone: true,
      prefs: {
        round: ["A"],
        size: ["€5-10M"],
        geo: ["Nordics", "Europe"],
        lead: ["lead"],
        sector: ["Software", "AI"],
        timing: ["3m"],
      },
    });
    expect(saved.confirmed).toBe(true);
    expect(saved.prefs.round).toEqual(["A"]);

    const fetchedPrefs = await service.getPreferences(COMPANY_ID);
    expect(fetchedPrefs.prefs.geo).toEqual(["Nordics", "Europe"]);
  });

  test("createDatabaseRunStore persists and loads matchup replays with fallback", async () => {
    const db = createFakeDb();
    const store = createDatabaseRunStore(db);
    const replay: MatchupReplay = {
      complete: true,
      savedAt: "2026-11-14T16:00:00.000Z",
      events: [{ type: "step", step: 1 }],
    };

    await store.save(COMPANY_ID, replay);
    expect(await store.load(COMPANY_ID)).toEqual(replay);
  });
});
