import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { matchupReplaySchema } from "@repo/shared";
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
