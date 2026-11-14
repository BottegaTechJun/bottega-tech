# Bottega

Ask questions about companies, people, funding rounds and investors. A Next.js frontend talks
to a small Bun backend, which queries the [Cala](https://cala.ai) knowledge graph.

```
browser → apps/web (:3000) → apps/api (:4000) → api.cala.ai
```

test

## Setup

Requires [Bun](https://bun.sh) 1.3+.

```sh
bun install
cp apps/api/.env.example apps/api/.env   # then set CALA_API_KEY
cp apps/webapp/.env.example apps/webapp/.env.local
```

The API refuses to start without `CALA_API_KEY`. The key stays on the backend. Set the same
`INTERNAL_API_SECRET` in both apps; private investor searches require signing in with NextAuth.

## Run

```sh
bun dev              # webapp on http://localhost:3001, api on http://localhost:4000
```

```sh
curl http://localhost:4000/health
curl -X POST http://localhost:4000/api/search \
  -H "Content-Type: application/json" \
  -d '{"input": "Which investors led seed rounds in Finnish startups in 2025?"}'
```

## Scripts

| Command             | What it does               |
| ------------------- | -------------------------- |
| `bun dev`           | Run web + api together     |
| `bun run build`     | Build both apps            |
| `bun run typecheck` | Type-check every workspace |
| `bun run lint`      | Biome lint + format check  |
| `bun run format`    | Biome format               |
| `bun test`          | Run tests                  |

## Structure

- `apps/web`: Next.js, Tailwind, shadcn/ui
- `apps/api`: Bun HTTP server, one folder per feature in `src/modules`
- `packages/shared`: zod schemas and types shared by both

Working with an AI agent? Start at [AGENTS.md](AGENTS.md). The Cala MCP server in `.mcp.json`
reads `CALA_API_KEY` from your shell environment.
