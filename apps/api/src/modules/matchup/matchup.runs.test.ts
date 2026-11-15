import { describe, expect, test } from "bun:test";
import type { MatchupEvent } from "@repo/shared";
import { createMatchupRoutes } from "./matchup.routes";
import { createRuns } from "./matchup.runs";
import type { MatchupService } from "./matchup.service";

const SECRET = "s";
const headers = { "x-bottega-user-id": "u1", "x-bottega-internal-secret": SECRET };

function request(path: string, init: RequestInit = {}, params: Record<string, string> = {}) {
  const req = new Request(`http://api${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  }) as Bun.BunRequest;
  Object.assign(req, { params });
  return req;
}

/** A fake agent that emits a few events, then waits for `release` before finishing. */
function fake() {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = {
    run: async (_req: unknown, send: (e: MatchupEvent) => void) => {
      send({ type: "start", sessionId: "x", model: "m", traceUrl: null });
      send({ type: "step", step: 1 });
      await gate;
      send({ type: "error", message: "end" });
    },
  } as unknown as MatchupService;
  return { service, release };
}

async function text(res: Response) {
  return res.status === 204 ? "" : await res.text();
}

describe("resumable matchup runs", () => {
  test("replays after Last-Event-ID and ends with 204 once read", async () => {
    const { service, release } = fake();
    const routes = createMatchupRoutes(service, SECRET, createRuns(10));
    const post = routes["/api/matchup"]?.POST;
    const get = routes["/api/matchup/:runId/events"]?.GET;
    if (!post || !get) throw new Error("routes missing");

    const started = await post(
      request("/api/matchup", {
        method: "POST",
        body: JSON.stringify({ companyId: crypto.randomUUID(), name: "n" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { runId } = (await started.json()) as { runId: string };
    await Bun.sleep(5);
    release();
    await Bun.sleep(5);

    const all = await text(await get(request("/e", {}, { runId })));
    expect(all).toContain("id: 0\n");
    expect(all).toContain("id: 2\n");

    const rest = await text(
      await get(request("/e", { headers: { "Last-Event-ID": "0" } }, { runId })),
    );
    expect(rest).not.toContain("id: 0\n");
    expect(rest).toContain("id: 1\n");

    const none = await get(request("/e", { headers: { "Last-Event-ID": "2" } }, { runId }));
    expect(none.status).toBe(204);
  });

  test("another user cannot read the run", async () => {
    const { service } = fake();
    const runs = createRuns(10);
    const runId = runs.start("someone-else", async () => {});
    const get = createMatchupRoutes(service, SECRET, runs)["/api/matchup/:runId/events"]?.GET;
    await expect(
      Promise.resolve().then(() => get?.(request("/e", {}, { runId }))),
    ).rejects.toThrow();
  });
});
