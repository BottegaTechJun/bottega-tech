# apps/api

Bun HTTP server on port 4000. Plain `Bun.serve` with its built-in router: no Hono, no Express.
It is the only place that knows `CALA_API_KEY`.

## Layout

```
src/
  index.ts            bootstrap: builds the client/service, mounts route tables, starts Bun.serve
  config/env.ts       zod-validated env; the process exits at startup if it is invalid
  lib/
    http-error.ts     HttpError + the {error: {code, message}} response shape
    http.ts           Routes type, request validation (parseJson/parseQuery/parse),
                      middleware (CORS, error handling, request logging)
  modules/
    health/           GET /health
    cala/
      cala.client.ts  thin typed Cala HTTP client: timeout, retry with backoff on 429, error mapping
      cala.service.ts calls the client and normalizes into @repo/shared contracts
      cala.routes.ts  our endpoints
      cala.schemas.ts zod schemas for Cala's raw responses
      cala.test.ts    client + service tests with a mocked fetch
```

## Endpoints

| Ours                              | Cala                        |
| --------------------------------- | --------------------------- |
| `GET  /health`                    | —                           |
| `POST /api/search` `{input}`      | `POST /v1/knowledge/search` |
| `POST /api/query` `{input}`       | `POST /v1/knowledge/query`  |
| `GET  /api/entities?name=&limit=` | `GET  /v1/entities`         |
| `GET  /api/entities/:id`          | `POST /v1/entities/{id}`    |

## Notes

- **Adding a feature:** create `modules/<name>/` with routes/service/schemas/tests, export a
  `Routes` table (path → method → handler), and spread it into `routes` in `index.ts`.
  The middleware in `lib/http.ts` is applied to every route there.
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
- Cala reference: the `cala` skill in `.claude/skills/cala`, or https://api.cala.ai/openapi.json.
