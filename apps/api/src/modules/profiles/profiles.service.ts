import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  MatchupReplay,
  ProfileInput,
  ProfileSummary,
  RunSummary,
  SavedProfile,
} from "@repo/shared";
import type { Database } from "../../lib/db";
import { profileFileSchema, runFileSchema } from "./profiles.schemas";

export interface ProfileOptions {
  /** Folder holding `<id>.json` and `<id>/runs/<run>.json` (used when `db` is omitted) */
  dir: string;
  /** Optional Aiven Postgres client; preferred over local files for multi-instance persistence */
  db?: Database | null;
}

export type ProfileService = ReturnType<typeof createProfileService>;

const safe = (name: string) => name.replace(/[^\w.-]/g, "");

async function read(path: string): Promise<unknown> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return file.json().catch(() => null);
}

/** Saved profiles and their matchup runs (Postgres when configured, else plain JSON files). */
export function createProfileService({ dir, db = null }: ProfileOptions) {
  const file = (id: string) => join(dir, `${safe(id)}.json`);
  const runs = (id: string) => join(dir, safe(id), "runs");

  async function get(id: string): Promise<SavedProfile | null> {
    if (db) return db.getSavedProfile(id);
    const parsed = profileFileSchema.safeParse(await read(file(id)));
    return parsed.success ? parsed.data : null;
  }

  async function write(profile: SavedProfile) {
    await mkdir(dir, { recursive: true });
    await Bun.write(file(profile.id), JSON.stringify(profile, null, 2));
  }

  /** Newest first. */
  async function list(): Promise<ProfileSummary[]> {
    if (db) return db.listSavedProfiles();
    const names = await readdir(dir).catch(() => []);
    const all = await Promise.all(
      names.filter((n) => n.endsWith(".json")).map((n) => get(n.slice(0, -5))),
    );
    return all
      .filter((p): p is SavedProfile => p !== null)
      .map(({ facts: _, ...summary }) => summary)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function create(input: ProfileInput, id: string = crypto.randomUUID()) {
    const now = new Date().toISOString();
    const profile: SavedProfile = { ...input, id, createdAt: now, updatedAt: now };
    if (db) return db.createSavedProfile(profile);
    await write(profile);
    return profile;
  }

  async function update(id: string, input: ProfileInput): Promise<SavedProfile | null> {
    if (db) return db.updateSavedProfile(id, input);
    const known = await get(id);
    if (!known) return null;
    const profile: SavedProfile = { ...known, ...input, updatedAt: new Date().toISOString() };
    await write(profile);
    return profile;
  }

  /** Removes the profile and every run under it. */
  async function remove(id: string): Promise<boolean> {
    if (db) return db.deleteSavedProfile(id);
    if (!(await get(id))) return false;
    await rm(join(dir, safe(id)), { recursive: true, force: true });
    await rm(file(id), { force: true });
    return true;
  }

  async function run(id: string, runId: string): Promise<MatchupReplay | null> {
    if (db) return db.getSavedProfileRun(id, runId);
    const parsed = runFileSchema.safeParse(await read(join(runs(id), `${safe(runId)}.json`)));
    return parsed.success ? parsed.data : null;
  }

  /** Newest first. */
  async function listRuns(id: string): Promise<RunSummary[]> {
    if (db) return db.listSavedProfileRuns(id);
    const names = await readdir(runs(id)).catch(() => []);
    const all = await Promise.all(
      names
        .filter((n) => n.endsWith(".json"))
        .map(async (n): Promise<RunSummary | null> => {
          const runId = n.slice(0, -5);
          const saved = await run(id, runId);
          if (!saved) return null;
          const start = saved.events.find((e) => e.type === "start");
          const done = saved.events.find((e) => e.type === "done");
          return {
            id: runId,
            sessionId: start?.type === "start" ? start.sessionId : null,
            savedAt: saved.savedAt,
            complete: saved.complete,
            picks: done?.type === "done" ? done.graph.investors.length : 0,
          };
        }),
    );
    return all
      .filter((r): r is RunSummary => r !== null)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  /** Saves a run under a new file; an existing run is never overwritten. Returns its id. */
  async function addRun(id: string, name: string, replay: MatchupReplay): Promise<string> {
    if (db) return db.addSavedProfileRun(id, name, replay);
    await mkdir(runs(id), { recursive: true });
    const base = safe(name) || "run";
    for (let n = 1; ; n++) {
      const runId = n === 1 ? base : `${base}-${n}`;
      try {
        await writeFile(join(runs(id), `${runId}.json`), JSON.stringify(replay), { flag: "wx" });
        return runId;
      } catch (err) {
        if ((err as { code?: string }).code !== "EEXIST") throw err;
      }
    }
  }

  return { list, get, create, update, remove, listRuns, run, addRun };
}
