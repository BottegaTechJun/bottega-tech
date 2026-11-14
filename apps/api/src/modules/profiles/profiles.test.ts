import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MatchupReplay, ProfileInput } from "@repo/shared";
import { withMiddleware } from "../../lib/http";
import { createProfileRoutes } from "./profiles.routes";
import { createProfileService, type ProfileService } from "./profiles.service";

const input: ProfileInput = {
  company: {
    id: "c85b2ed9-1483-5a4c-8105-7ea2103fcc7e",
    name: "CRACI",
    description: null,
    hq: "Helsinki",
    website: "craci.com",
  },
  facts: null,
  prefs: { round: ["A"], size: [], geo: ["Nordics"], lead: ["lead"], sector: [], timing: [] },
};

const replay = (savedAt: string, complete: boolean): MatchupReplay => ({
  complete,
  savedAt,
  events: [{ type: "start", sessionId: "warmup-1", model: "mock", traceUrl: null }],
});

let dir: string;
let service: ProfileService;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "profiles-"));
  service = createProfileService({ dir });
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("profile service", () => {
  test("creates, lists, updates and deletes profiles", async () => {
    const made = await service.create(input);
    expect(await service.get(made.id)).toEqual(made);
    expect((await service.list()).map((p) => p.company.name)).toEqual(["CRACI"]);
    expect((await service.list()).some((p) => "facts" in p)).toBe(false);

    const changed = await service.update(made.id, {
      ...input,
      prefs: { ...input.prefs, round: ["B"] },
    });
    expect(changed?.prefs.round).toEqual(["B"]);
    expect(changed?.createdAt).toBe(made.createdAt);

    expect(await service.remove(made.id)).toBe(true);
    expect(await service.get(made.id)).toBeNull();
    expect(await service.remove(made.id)).toBe(false);
  });

  test("never overwrites a saved run", async () => {
    const { id } = await service.create(input);
    expect(await service.addRun(id, "warmup-1", replay("2026-01-01", true))).toBe("warmup-1");
    expect(await service.addRun(id, "warmup-1", replay("2026-01-02", false))).toBe("warmup-1-2");

    const runs = await service.listRuns(id);
    expect(runs.map((r) => [r.id, r.complete])).toEqual([
      ["warmup-1-2", false],
      ["warmup-1", true],
    ]);
    expect(runs[0]?.sessionId).toBe("warmup-1");
    expect((await service.run(id, "warmup-1"))?.savedAt).toBe("2026-01-01");
  });
});

describe("profile routes", () => {
  const call = async (method: string, path: string, body?: unknown) => {
    const routes = withMiddleware(createProfileRoutes(service), { corsOrigin: "*" });
    const server = Bun.serve({ port: 0, routes });
    try {
      return await fetch(new URL(path, server.url), {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
    } finally {
      server.stop();
    }
  };

  test("validates input and answers 404 for unknown profiles", async () => {
    expect((await call("POST", "/api/profiles", { company: {} })).status).toBe(400);
    const res = await call("GET", "/api/profiles/7e57a3c1-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });

  test("creates a profile and lists its runs", async () => {
    const created = await call("POST", "/api/profiles", input);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    await service.addRun(id, "warmup-1", replay("2026-01-01", true));
    const runs = await call("GET", `/api/profiles/${id}/runs`);
    expect(await runs.json()).toMatchObject({ runs: [{ id: "warmup-1", complete: true }] });
    expect((await call("GET", `/api/profiles/${id}/runs/warmup-1`)).status).toBe(200);
    expect((await call("DELETE", `/api/profiles/${id}`)).status).toBe(204);
  });
});
