# apps/webapp

Founder onboarding (Next.js App Router, Tailwind v4, port 3001). Talks only to `apps/api`.

## Flow

1. **Find**: company search via `GET /api/onboarding/companies?name=`.
2. **Confirm**: sourced profile via `GET /api/onboarding/companies/:id` (rounds, investors, team, Slush).
3. **Preferences**: six one-tap questions (`src/lib/prefs.ts`).
4. **Done**: home turns into a dashboard (company, facts, preferences, edit), then `/warm-paths`.
5. **Warm paths**: canvas of the matchup agent's answer (`components/canvas/`), live SSE trace in a
   collapsible side panel, last saved run replayed on open.

Steps live in the URL (`/?step=find|confirm|prefs`). Deep links to steps not reached yet redirect to the first open step.

Progress lives in localStorage (`src/lib/store.ts`), validated with zod on read. No accounts.

## Layout

```
src/
  app/            layout (Geist fonts), globals.css (tokens + @utility classes), pages
  components/     shell, progress-bar, step-cards, find/confirm/prefs steps, dashboard, source badge, logo
  lib/            api.ts (zod-validated client), format.ts, prefs.ts, store.ts
```

## Notes

- Dark theme only. One accent (`--color-accent`). Radius: panel 20px, cards 16px, buttons pill.
- Data rules (docs/CONTEXT.md §7): missing `is_lead` shows "Participated", missing amount shows "—".
- Every fact shows a source badge (FILING / PRIMARY / PRESS / AGGREGATOR) linking to the document.
- The demo company (In Parallel) is precomputed in `apps/api/src/modules/onboarding/fixtures/demo.json`.
  Refresh it with `bun run --filter api snapshot`.
- Env: `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`). Add `http://localhost:3001` to the
  API's `CORS_ORIGIN` (comma separated).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
