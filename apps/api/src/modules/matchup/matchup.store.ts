import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { matchupReplaySchema } from "@repo/shared";
import type { Database } from "../../lib/db";
import type { RunStore } from "./matchup.service";

/** Saves the last run per company as JSON files in `dir`, so the board can replay it instantly. */
export function createFileRunStore(dir: string): RunStore {
  const path = (companyId: string) => join(dir, `${companyId.replace(/[^\w-]/g, "")}.json`);

  return {
    async load(companyId) {
      const file = Bun.file(path(companyId));
      if (!(await file.exists())) return null;
      const parsed = matchupReplaySchema.safeParse(await file.json().catch(() => null));
      return parsed.success ? parsed.data : null;
    },
    async save(companyId, run) {
      await mkdir(dir, { recursive: true });
      await Bun.write(path(companyId), JSON.stringify(run));
    },
  };
}

/**
 * Stores matchup runs in Aiven Postgres (`matchup_runs` + `matchup_run_history`),
 * with an optional file-store fallback for local offline replay.
 */
export function createDatabaseRunStore(db: Database | null, fallback?: RunStore): RunStore {
  if (!db) {
    return (
      fallback ?? {
        load: async () => null,
        save: async () => undefined,
      }
    );
  }

  return {
    async load(companyId) {
      try {
        const fromDb = await db.loadMatchupRun(companyId);
        if (fromDb) return fromDb;
      } catch {
        // Fall through to local file store if Postgres is temporarily unreachable
      }
      return (await fallback?.load(companyId)) ?? null;
    },
    async save(companyId, run) {
      await Promise.allSettled([db.saveMatchupRun(companyId, run), fallback?.save(companyId, run)]);
    },
  };
}
