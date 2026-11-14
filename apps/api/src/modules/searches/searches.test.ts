import { describe, expect, test } from "bun:test";
import { withMiddleware } from "../../lib/http";
import { createSearchRoutes } from "./searches.routes";
import { createSearchSessionStore } from "./searches.service";

const input = {
  company: {
    id: "6ebd9536-fcc5-5921-8938-ce3497eb6262",
    name: "In Parallel",
    description: null,
    hq: null,
    website: null,
  },
  facts: null,
  prefs: { round: [], size: [], geo: [], lead: [], sector: [], timing: [] },
};

const replay = {
  complete: true,
  savedAt: "2026-11-14T16:00:00.000Z",
  events: [{ type: "step", step: 1 } as const],
};

describe("search session routes", () => {
  test("marks a saved snapshot as running until it finishes or errors", async () => {
    const store = createSearchSessionStore(null);
    await store.save(
      "alice",
      "run-live",
      input,
      {
        complete: false,
        savedAt: "2026-11-14T16:00:00.000Z",
        events: [{ type: "start", sessionId: "run-live", model: "mock", traceUrl: null }],
      },
      null,
    );

    expect((await store.list("alice"))[0]?.status).toBe("running");
    expect((await store.load("alice", "run-live"))?.status).toBe("running");
  });

  test("only the authenticated owner can list, read, or delete a search", async () => {
    const store = createSearchSessionStore(null);
    await store.save("alice", "run-a", input, replay, null);
    await store.save("bob", "run-b", input, replay, null);
    const routes = withMiddleware(createSearchRoutes(store, "secret"), { corsOrigin: "*" });
    const server = Bun.serve({ port: 0, routes });

    const call = (method: string, path: string, user?: string) =>
      fetch(new URL(path, server.url), {
        method,
        headers: user
          ? { "x-bottega-user-id": user, "x-bottega-internal-secret": "secret" }
          : undefined,
      });

    try {
      expect(await (await call("GET", "/api/search-sessions", "alice")).json()).toMatchObject({
        sessions: [{ id: "run-a" }],
      });
      expect((await call("GET", "/api/search-sessions/run-a", "bob")).status).toBe(404);
      expect((await call("DELETE", "/api/search-sessions/run-a", "bob")).status).toBe(404);
      expect((await call("GET", "/api/search-sessions")).status).toBe(401);
    } finally {
      server.stop();
    }
  });
});
