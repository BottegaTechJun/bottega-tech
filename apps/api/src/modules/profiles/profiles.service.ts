import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  MatchupReplay,
  ProfileInput,
  ProfileSummary,
  RunSummary,
  SavedProfile,
} from "@repo/shared";
import { profileFileSchema, runFileSchema } from "./profiles.schemas";

export interface ProfileOptions {
  /** Folder holding `<id>.json` and `<id>/runs/<run>.json` */
  dir: string;
}

export type ProfileService = ReturnType<typeof createProfileService>;

const safe = (name: string) => name.replace(/[^\w.-]/g, "");

async function read(path: string): Promise<unknown> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return file.json().catch(() => null);
}

/** Saved profiles and their matchup runs, as plain JSON files. Runs are only ever added. */
export function createProfileService({ dir }: ProfileOptions) {
  const file = (id: string) => join(dir, `${safe(id)}.json`);
  const runs = (id: string) => join(dir, safe(id), "runs");

  async function get(id: string): Promise<SavedProfile | null> {
    const parsed = profileFileSchema.safeParse(await read(file(id)));
    return parsed.success ? parsed.data : null;
  }

  async function write(profile: SavedProfile) {
    await mkdir(dir, { recursive: true });
    await Bun.write(file(profile.id), JSON.stringify(profile, null, 2));
  }

  /** Newest first. */
  async function list(): Promise<ProfileSummary[]> {
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
    await write(profile);
    return profile;
  }

  async function update(id: string, input: ProfileInput): Promise<SavedProfile | null> {
    const known = await get(id);
    if (!known) return null;
    const profile: SavedProfile = { ...known, ...input, updatedAt: new Date().toISOString() };
    await write(profile);
    return profile;
  }

  /** Removes the profile and every run under it. */
  async function remove(id: string): Promise<boolean> {
    if (!(await get(id))) return false;
    await rm(join(dir, safe(id)), { recursive: true, force: true });
    await rm(file(id), { force: true });
    return true;
  }

  async function run(id: string, runId: string): Promise<MatchupReplay | null> {
    const parsed = runFileSchema.safeParse(await read(join(runs(id), `${safe(runId)}.json`)));
    return parsed.success ? parsed.data : null;
  }

  /** Newest first. */
  async function listRuns(id: string): Promise<RunSummary[]> {
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
