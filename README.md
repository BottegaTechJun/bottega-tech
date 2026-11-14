# Bottega

**Founder onboarding and warm-path investor discovery powered by the [Cala](https://cala.ai) knowledge graph.**

Bottega helps startup founders verify their company profile from grounded filings and press sources, define fundraising preferences, and run an autonomous AI matchup agent that maps verified warm paths to target investors on an interactive graph canvas.

```
Browser (Next.js / Vercel) ──► apps/api (Bun / Cloud Run) ──► Cala REST & MCP API
                                  │                                   │
                                  ├── Aiven PostgreSQL (persistence)   │
                                  ├── Aiven Valkey (SHA-256 L2 cache)  │
                                  └── Gemini ToolLoopAgent + Langfuse ◄┘
```

---

## Features

- **Verified Founder Onboarding (`apps/webapp` + `onboarding` module)**
  - Instant company lookup and deduplication via Cala entity search & retrieval (`GET /api/onboarding/companies?name=`).
  - Sourced company profile builder (`GET /api/onboarding/companies/:id`) extracting funding rounds, lead/participating investors, founders/CEOs, industries, HQ, and Slush 2026 listing status—with ranked source badges (`FILING`, `PRIMARY`, `PRESS`, `AGGREGATOR`).
  - 6-step fundraising preferences flow (round, check size, geography, lead preference, sector, timing) persisted per company (`GET/PUT /api/onboarding/companies/:id/preferences`).
  - Precomputed demo snapshot (`In Parallel`) for instant zero-latency demos.

- **AI Investor Matchup Agent & Warm-Paths Canvas (`matchup` + `brands` modules)**
  - Powered by Vercel AI SDK `ToolLoopAgent` + Google Gemini (`gemini-4-carbon`) connected to Cala's MCP server (`https://api.cala.ai/mcp/`).
  - Real-time Server-Sent Events (`POST /api/matchup`) streaming agent thinking, tool calls, and the grounded knowledge graph.
  - Strict grounding filter (`ground.ts`) that drops any entity ID or citation URL not backed by actual MCP tool results.
  - Interactive React Flow (`@xyflow/react`) warm-paths board with route exploration, investor panel, entity detail inspection, brand logos (`POST /api/brands`), and collapsible live execution trace.

- **Saved Profiles, Run History & Persistence (`profiles` module + `db.ts`)**
  - Multi-profile workspace (`GET/POST /api/profiles`, `GET/PUT/DELETE /api/profiles/:id`) with immutable run history (`GET /api/profiles/:id/runs`, `GET /api/profiles/:id/runs/:run`).
  - **Aiven PostgreSQL** persistence via Bun's native `SQL` client with automatic schema migration (`companies`, `funding_rounds`, `investors`, `company_investors`, `company_people`, `founder_preferences`, `matchup_runs`, `matchup_run_history`, `users`) and local JSON fallback.
  - **Two-tier caching** (in-memory L1 + **Aiven Valkey** L2 keyed by SHA-256 request digest) for fast, resilient Cala lookups with 429 retry/backoff.

- **Authentication & Observability**
  - **Google OAuth 2.0** via NextAuth.js (`apps/webapp`) with user sync to Postgres (`POST /api/onboarding/users`).
  - **Langfuse + OpenTelemetry** tracing (`@langfuse/otel`, `@langfuse/vercel-ai-sdk`) tagging each matchup session with profile metadata and deep links into Langfuse traces.

---

## Tech Stack

| Layer                         | Technologies                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Runtime & Package Manager** | [Bun](https://bun.sh) (`1.4+`), TypeScript (strict mode)                                                     |
| **Frontend (`apps/webapp`)**  | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, `@xyflow/react`, Lucide Icons, NextAuth.js v4 |
| **Backend (`apps/api`)**      | `Bun.serve` native HTTP/SSE router (zero web framework overhead), Zod v4                                     |
| **AI & Knowledge Graph**      | [Cala API & MCP](https://cala.ai), Vercel AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/mcp`), Google Gemini      |
| **Database & Cache**          | Aiven PostgreSQL (`Bun.SQL`), Aiven Valkey / Redis (`Bun.RedisClient`)                                       |
| **Observability**             | Langfuse (`@langfuse/otel`, `@langfuse/tracing`, `@langfuse/vercel-ai-sdk`), OpenTelemetry                   |
| **Contracts & Tooling**       | `@repo/shared` (shared Zod schemas & inferred types), Biome (lint & format), Bun Test                        |
| **Deployment**                | Vercel (Frontend), Google Cloud Run + Docker (`oven/bun:1`) + GitHub Actions (Backend)                       |

---

## Repository Structure

```
apps/
  webapp/                 Next.js 16 frontend (founder onboarding, warm-paths canvas, NextAuth)
    src/app/              App Router pages (/, /warm-paths, /api/auth/[...nextauth])
    src/components/       Shell, onboarding steps, dashboard, React Flow canvas & trace panels
    src/lib/              Zod-validated API client, NextAuth config, local store, prefs
  api/                    Bun.serve backend (the only service holding secrets/API keys)
    src/config/           Zod-validated environment loader (env.ts)
    src/db/               CLI migration & demo seed script (migrate.ts)
    src/lib/              HTTP middleware (CORS, Zod parsing, error shape), Postgres & Valkey clients, Langfuse
    src/modules/
      health/             GET /health
      cala/               Typed Cala REST client (retries, 429 handling, caching)
      onboarding/         Company search, profile builder, preferences, user sync
      matchup/            Gemini + Cala MCP agent, SSE streaming, grounding, run store
      profiles/           Saved company profiles & immutable run replay store
      brands/             Entity domain lookup for canvas logos
packages/
  shared/                 Shared Zod schemas and TypeScript types (web <-> api contract)
.github/workflows/        CI/CD pipeline deploying apps/api to Google Cloud Run
Dockerfile                Non-root Bun production image with healthcheck
```

---

## API Endpoints

| Method & Path                                   | Description                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `GET /health`                                   | Health check (`{ status: "ok" }`)                                 |
| `GET /api/onboarding/companies?name=`           | Search companies via Cala                                         |
| `GET /api/onboarding/companies/:id`             | Get grounded company profile (rounds, investors, people, Slush)   |
| `GET /api/onboarding/companies/:id/preferences` | Fetch saved founder fundraising preferences                       |
| `PUT /api/onboarding/companies/:id/preferences` | Save/update founder fundraising preferences                       |
| `POST /api/onboarding/users`                    | Upsert authenticated Google OAuth user                            |
| `POST /api/matchup`                             | Stream investor matchup agent execution & grounded graph over SSE |
| `GET /api/matchup/:id/last`                     | Fetch latest saved matchup replay for a company                   |
| `GET /api/profiles`                             | List saved profiles                                               |
| `POST /api/profiles`                            | Create a saved profile                                            |
| `GET /api/profiles/:id`                         | Get a saved profile with facts & preferences                      |
| `PUT /api/profiles/:id`                         | Update a saved profile                                            |
| `DELETE /api/profiles/:id`                      | Delete a profile and its saved runs                               |
| `GET /api/profiles/:id/runs`                    | List matchup runs for a profile                                   |
| `GET /api/profiles/:id/runs/:run`               | Replay a specific saved matchup run                               |
| `POST /api/brands`                              | Resolve grounded website domains for entity UUIDs                 |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.3+ (tested on 1.4.x)
- A [Cala](https://cala.ai) API key (`CALA_API_KEY`)
- Optional for full functionality: Gemini API key (`GEMINI_API_KEY`), Aiven PostgreSQL (`DATABASE_URL`), Aiven Valkey (`VALKEY_URL`), Google OAuth credentials, Langfuse keys

### 1. Install dependencies

```sh
bun install
```

### 2. Configure environment variables

Copy the example env files and fill in your values:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/webapp/.env.example apps/webapp/.env.local
```

**Backend (`apps/api/.env`):**

| Variable              | Required | Default                      | Description                                                                                    |
| --------------------- | -------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `CALA_API_KEY`        | Yes      | —                            | Cala API secret key (never exposed to frontend)                                                |
| `PORT`                | No       | `4000`                       | API server port (`8080` in Docker/Cloud Run)                                                   |
| `CORS_ORIGIN`         | No       | `http://localhost:3000`      | Comma-separated allowed origins (e.g. `http://localhost:3001,https://bottega-tech.vercel.app`) |
| `DATABASE_URL`        | No       | —                            | Aiven PostgreSQL connection string (`postgres://...`)                                          |
| `VALKEY_URL`          | No       | —                            | Aiven Valkey/Redis connection string (`rediss://...`)                                          |
| `GEMINI_API_KEY`      | No       | —                            | Enables `POST /api/matchup` AI agent                                                           |
| `MATCHUP_MODEL`       | No       | `gemini-4-carbon`            | Gemini model ID for matchup agent                                                              |
| `MATCHUP_MAX_STEPS`   | No       | `16`                         | Max tool-calling steps per matchup run                                                         |
| `LANGFUSE_PUBLIC_KEY` | No       | —                            | Enables Langfuse OpenTelemetry tracing                                                         |
| `LANGFUSE_SECRET_KEY` | No       | —                            | Langfuse secret key                                                                            |
| `LANGFUSE_BASE_URL`   | No       | `https://cloud.langfuse.com` | Langfuse host URL                                                                              |
| `LANGFUSE_PROJECT_ID` | No       | —                            | Enables direct trace session links in the UI                                                   |

**Frontend (`apps/webapp/.env.local`):**

| Variable               | Required  | Default                 | Description                                        |
| ---------------------- | --------- | ----------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`  | No        | `http://localhost:4000` | Backend API base URL                               |
| `NEXTAUTH_URL`         | For OAuth | `http://localhost:3001` | Canonical URL of the webapp                        |
| `NEXTAUTH_SECRET`      | For OAuth | —                       | Session signing secret (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID`     | For OAuth | —                       | Google Cloud OAuth 2.0 Client ID                   |
| `GOOGLE_CLIENT_SECRET` | For OAuth | —                       | Google Cloud OAuth 2.0 Client Secret               |

### 3. Run database migrations (optional, if `DATABASE_URL` is set)

```sh
bun run --filter api db:migrate
```

_(The API also auto-migrates the schema on startup when `DATABASE_URL` is configured.)_

### 4. Run in development

```sh
bun dev
```

- **Webapp:** `http://localhost:3001`
- **API:** `http://localhost:4000`

---

## Scripts

| Command                           | Description                                                   |
| --------------------------------- | ------------------------------------------------------------- |
| `bun dev`                         | Start apps in development mode                                |
| `bun run build`                   | Build workspace apps                                          |
| `bun run typecheck`               | Run `tsc --noEmit` (and `next typegen`) across all workspaces |
| `bun run lint`                    | Run Biome lint and formatting checks                          |
| `bun run format`                  | Format codebase with Biome                                    |
| `bun test`                        | Run backend unit & integration tests                          |
| `bun audit`                       | Audit dependencies for known vulnerabilities                  |
| `bun run --filter api snapshot`   | Refresh precomputed onboarding demo fixture                   |
| `bun run --filter api db:migrate` | Apply PostgreSQL schema and seed demo company                 |

---

## Deployment

- **Frontend (`apps/webapp`):** Deployed on **Vercel** (`https://bottega-tech.vercel.app`). Set `NEXT_PUBLIC_API_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` in Vercel project settings.
- **Backend (`apps/api`):** Automatically built via [Dockerfile](Dockerfile) and deployed to **Google Cloud Run** (`europe-north1`) on push to `main` via [deploy-api.yml](.github/workflows/deploy-api.yml). Ensure `CORS_ORIGIN` includes your production frontend URL.

---

## Contributors

- **Pavlo Antokhiv** ([@pavlo1377](https://github.com/pavlo1377))
- **Tauheed Butt** ([@tauheedbuttt](https://github.com/tauheedbuttt))
- **Danylo Yen** ([@DanyaYen](https://github.com/DanyaYen))

---

## License

See [LICENSE](LICENSE).
