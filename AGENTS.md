# Bottega

Hackathon MVP on top of the [Cala](https://cala.ai) knowledge graph (companies, people,
funding rounds, investors). The repo is boilerplate ready for features; none are built yet.

## Request flow

1. The frontend (`apps/web`) calls **our** backend (`apps/api`) through `src/lib/api.ts`.
2. The backend calls the Cala API with the secret key and normalizes the response into a
   `@repo/shared` contract.
3. The frontend validates the response against the same contract and renders it.

## Repo map

```
apps/
  web/              Next.js (App Router) + Tailwind + shadcn/ui   → see apps/web/AGENTS.md
  webapp/           Founder onboarding (Next.js, :3001)           → see apps/webapp/AGENTS.md
  api/              Bun HTTP server (Bun.serve, no framework)     → see apps/api/AGENTS.md
packages/
  shared/           zod schemas + inferred types: the web ↔ api contract
.claude/skills/cala Cala agent skill (API reference, query syntax)
.mcp.json           Cala MCP server for Claude Code (reads CALA_API_KEY from your shell env)
biome.json          lint + format config for the whole repo
tsconfig.base.json  strict TS settings every package extends
```

## Commands (run from the repo root)

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `bun install`       | Install all workspaces                          |
| `bun dev`           | Run web (:3000), webapp (:3001) and api (:4000) |
| `bun run build`     | Build both apps                                 |
| `bun run typecheck` | `tsc --noEmit` in every workspace               |
| `bun run lint`      | Biome lint + format check                       |
| `bun run format`    | Biome format (writes)                           |
| `bun test`          | Bun tests                                       |

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
