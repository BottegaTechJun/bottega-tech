# apps/webapp

Founder onboarding (Next.js App Router, Tailwind v4, port 3001). Talks only to `apps/api`.

## Flow

1. **Find**: company search via `GET /api/onboarding/companies?name=`.
2. **Confirm**: sourced profile via `GET /api/onboarding/companies/:id` (rounds, investors, team, Slush).
3. **Preferences**: six one-tap questions (`src/lib/prefs.ts`).
4. **Done**: summary, then `/warm-paths` (placeholder).

Progress lives in localStorage (`src/lib/store.ts`). No accounts.

## Layout

```
src/
  app/            layout (Geist fonts), globals.css (tokens + @utility classes), pages
  components/     shell, progress-bar, step-cards, find/confirm/prefs/done steps, source badge, logo
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
