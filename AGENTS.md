# Bottega

Hackathon MVP: ask questions about companies, people, funding rounds and investors, answered
from the [Cala](https://cala.ai) knowledge graph.

## MVP flow

1. The user types a question in the frontend (`apps/web`).
2. The frontend calls **our** backend (`apps/api`).
3. The backend calls the Cala API with the secret key and normalizes the response.
4. The frontend validates the response and renders it.

Two modes: **Search** (natural language → markdown answer, sources, entities) and **Query**
(structured Dot-Notation, e.g. `startups.location=Spain.funding>10M.funding<50M` → table).

## Repo map

```
apps/
  web/              Next.js (App Router) + Tailwind + shadcn/ui   → see apps/web/AGENTS.md
  api/              Bun HTTP server (Bun.serve, no framework)     → see apps/api/AGENTS.md
packages/
  shared/           zod schemas + inferred types: the web ↔ api contract
.claude/skills/cala Cala agent skill (API reference, query syntax)
.mcp.json           Cala MCP server for Claude Code (reads CALA_API_KEY from your shell env)
biome.json          lint + format config for the whole repo
tsconfig.base.json  strict TS settings every package extends
```

## Commands (run from the repo root)

| Command             | What it does                             |
| ------------------- | ---------------------------------------- |
| `bun install`       | Install all workspaces                   |
| `bun dev`           | Run web (:3000) and api (:4000) together |
| `bun run build`     | Build both apps                          |
| `bun run typecheck` | `tsc --noEmit` in every workspace        |
| `bun run lint`      | Biome lint + format check                |
| `bun run format`    | Biome format (writes)                    |
| `bun test`          | Bun tests                                |

## Conventions

- **Strict TypeScript.** Every tsconfig extends `tsconfig.base.json`. No `any`, no `@ts-ignore`.
- **zod at every boundary.** Validate env, incoming requests, Cala's responses and (on the web)
  our API's responses. Types are inferred from schemas, never written twice.
- **Shared contracts live in `packages/shared`.** If web and api both need a shape, it goes
  there; import it as `@repo/shared`.
- **The Cala key never reaches the frontend.** `CALA_API_KEY` exists only in `apps/api/.env`.
  The web app talks only to our API. Never add it to a `NEXT_PUBLIC_*` variable.
- **Modular backend.** New feature = new folder in `apps/api/src/modules/` with
  `*.routes.ts`, `*.service.ts`, `*.schemas.ts` and `*.test.ts`.
- **No extra frameworks or helper libraries without asking.** The backend is plain `Bun.serve`
  (no Hono/Express). The UI is stock shadcn/ui components themed through `globals.css`.
- **Errors** from the API always look like `{ "error": { "code", "message" } }`.
- Keep it minimal: this is an MVP. Don't build features nobody asked for.

## Definition of done

`bun run typecheck`, `bun run lint` and `bun test` all pass.
