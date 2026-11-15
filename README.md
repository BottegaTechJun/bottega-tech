# Bottega

We built an agent that starts with your company and ends with a map of the investors who could lead your next round, plus the people who can introduce you. Every fact comes from [Cala](https://cala.ai) and links to its source.

```
browser → apps/webapp (:3001) → apps/api (:4000) → api.cala.ai
```

## What we built

**1. Your profile, from Cala.** You type your company name. Cala already knows your past rounds, who invested, who led, your team, and whether you are listed for Slush 2026. So instead of a long form, we pull that profile and show it back with a source badge on every fact (filing, company site, press or aggregator).

**2. What you want next.** Six one-tap questions turn into instructions for the agent. Round and sector are prefilled from your Cala profile.

- **Which round are you raising?** Tells the agent which rounds to study, so it looks at who led Series A deals, not seed.
- **How much?** Compared with round amounts, so a €5M raise isn't matched with funds that only write €50M rounds.
- **Where should investors be?** Checked against where each fund is based, so a Nordic founder sees Nordic funds first.
- **What role should they take?** Lead, co-lead or follow. Asking for a lead means it only counts rounds the fund actually led.
- **Sector focus?** Matched with the industries of companies a fund backed, so leads have done deals like yours.
- **When do you start?** If you raise now, it favours funds with recent, dated rounds.

**3. The agent walks the graph.** Using Cala's MCP tools, it:

- takes your current investors and finds the other rounds they joined,
- checks who took the lead on those rounds,
- follows those leads into their portfolios.

The result is paths like: *your investor co-invested with this fund, so ask them for the intro.* As a bonus, when a company from that deal is listed for Slush 2026, we flag it so you know whose founder to find there. It never filters anyone out.

**4. The canvas.** Everything lands on an interactive board with at most five leads. Click any node or line to see the round, date, amount and source URL. A live trace shows every Cala call the agent makes.

**5. Follow-ups and history.** After a run you can ask "only funds that led in the last year" or "only Nordic funds". The agent revises its answer instead of starting over. Searches are saved and can be replayed.

**Demo case.** In Parallel, Helsinki, €2.8M seed led by Lifeline Ventures, listed for Slush. Lifeline joined Series A rounds led by Karma Ventures (Swarmia) and Vendep (Inven). So: ask Lifeline for an intro to Karma, and meet the Swarmia founders at Slush.

## How we use Cala

Cala is the data under everything. We keep no company or investor data of our own.

- **Entity API** for onboarding: entity search finds the company, introspection shows which fields and links exist, and retrieval fetches the sourced values.
- **Cala MCP** for the agent: the same entity tools, plus knowledge search as a fallback whose origins become cited sources.
- **Links we rely on:** who took part in each funding round (as investor or issuer, whether they led, with dated sources), who invested in whom, founders and CEOs, and which companies are listed for Slush.

Following *company → rounds → co-investors → leads → their companies* is a multi-hop walk web search can't do, and Cala gives a source at every step.

We also made sure the agent can't make things up. These rules are enforced in code:

- It can only cite entity IDs and URLs that came back from a Cala call. Anything else is dropped.
- An investor without a source is removed.
- If Cala doesn't say whether a fund led, we show "participated", never "did not lead".
- Recency comes from dated round records, not undated search hits.
- We show what happened and never predict what a fund will do.

## How we built it

A Bun monorepo: Next.js webapp, Bun API and shared zod schemas that validate every boundary.

- **Agent:** Vercel AI SDK tool-loop agent running Gemini over Cala's MCP tools.
- **Streaming:** live trace over SSE from Cloud Run.
- **Rate limits:** a shared gate lets at most three Cala calls out at once, and pauses and retries all calls on a 429.
- **Speed:** cached in memory and Valkey, demo company precomputed.
- **Storage:** runs in Postgres with event replay, Google sign-in, Langfuse tracing, 82 passing tests.
- **Deploy:** API on Google Cloud Run through GitHub Actions, webapp on Vercel.

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
