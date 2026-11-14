# apps/api

Bun HTTP server on port 4000. Plain `Bun.serve` with its built-in router: no Hono, no Express.
It is the only place that knows `CALA_API_KEY`.

## Layout

```
src/
  index.ts            bootstrap: builds the shared Cala client, mounts route tables, starts Bun.serve
  config/env.ts       zod-validated env; the process exits at startup if it is invalid
  lib/
    http-error.ts     HttpError + the {error: {code, message}} response shape
    http.ts           Routes type, request validation (parseJson/parseQuery/parse),
                      middleware (CORS, error handling, request logging)
    cache.ts          two-tier cache (in-memory + optional Valkey) keyed by SHA-256
    db.ts             Aiven Postgres client (Bun SQL) + relational schema & repositories
  db/
    migrate.ts        applies schema migration and seeds demo company into Postgres
  modules/
    health/           GET /health
    cala/             Cala integration only, no routes of its own
      cala.client.ts  thin typed Cala HTTP client: timeout, retry on 429, error mapping, cache
      cala.schemas.ts zod schemas for Cala's raw responses
      cala.test.ts    client tests with a mocked fetch
```

## Endpoints

| Ours                                            | Notes                                       |
| ----------------------------------------------- | ------------------------------------------- |
| `GET /health`                                   | `{ status: "ok" }` (`HealthResponse`)       |
| `GET /api/onboarding/companies?name=`           | Company search (entity search + retrieval)  |
| `GET /api/onboarding/companies/:id`             | Sourced profile (introspection + retrieval) |
| `GET /api/onboarding/companies/:id/preferences` | Saved founder onboarding preferences        |
| `PUT /api/onboarding/companies/:id/preferences` | Upsert founder onboarding preferences       |
| `POST /api/matchup`                             | Investor matchup agent, streamed over SSE   |
| `GET /api/matchup/:id/last`                     | Last saved matchup run for a company        |

## Notes

- **Adding a feature:** create `modules/<name>/` with `<name>.routes.ts`, `<name>.service.ts`,
  `<name>.schemas.ts` and `<name>.test.ts`. The service takes the Cala client
  (`createXService(cala)`), and the routes take the service and export a `Routes` table
  (path → method → handler). Spread it into `routes` in `index.ts`. The middleware in
  `lib/http.ts` is applied to every route there.
- **Handlers** validate input with `parseJson` / `parseQuery` / `parse` and return
  `Response.json(...)`. To fail, `throw new HttpError(status, code, message)`; never build
  error responses by hand.
- **Layers:** routes do HTTP only, the service does normalization, the client does Cala I/O.
  Request/response contracts come from `@repo/shared`.
- **Cala schemas are tolerant on purpose** (`z.looseObject`, zod 4's `.passthrough()`): unknown
  fields pass through and query rows are free-form. Don't tighten them.
- **Tests never hit the network.** Inject a mock through the client's `fetch` option. Tests
  must not import `config/env.ts` (it exits without a key).
- Env lives in `apps/api/.env` (see `.env.example`); Bun loads it automatically.
- **Onboarding** serves `modules/onboarding/fixtures/demo.json` first (the demo company, instant),
  then caches live results for an hour. Refresh the fixture with `bun run snapshot`.
- `CORS_ORIGIN` accepts a comma-separated list (web on :3000, webapp on :3001).
- **Matchup** (`modules/matchup/`) runs a Gemini `ToolLoopAgent` over Cala's MCP tools and grounds
  its answer in the tool results (unknown ids and URLs are dropped). Each run is traced in Langfuse
  (one session per lookup) and saved to `apps/api/.runs/` so the board can replay it.
- Cala reference: the `cala` skill in `.claude/skills/cala`, or https://api.cala.ai/openapi.json.
