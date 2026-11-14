# apps/web

Next.js (App Router, `src/` dir) + Tailwind CSS v4 + shadcn/ui. One page, `/`.

## Layout

```
src/
  app/
    layout.tsx        fonts, <Toaster />
    page.tsx          the only page
    globals.css       design tokens + project component classes (the single place for styling)
  components/
    explorer.tsx      client component: mode tabs, input, request state
    search-result.tsx markdown answer, entity badges, sources
    query-result.tsx  table built from the returned row keys
    ui/               shadcn components (generated; do not hand-edit)
  lib/
    api.ts            typed API client; validates every response with @repo/shared schemas
```

## Notes

- **UI = stock shadcn components.** Need a widget? `bunx --bun shadcn@latest add <name>` from
  this folder and use it as generated. shadcn here is the Base UI flavor (`base-nova` style).
- **Styling lives in `src/app/globals.css`.** Colors, radius and fonts are CSS variables in
  `:root` / `.dark`; change the look there, not per component. Layout and content patterns
  (`.page`, `.stack`, `.empty-state`, `.markdown`, `.table-frame`, …) are classes in
  `@layer components`. Add a new class there instead of repeating long utility strings.
- **No class-name helper libraries in our code** (`cn`, `clsx`, `classnames`, `cva`). Only the
  generated files in `components/ui/` use them internally.
- **All backend calls go through `src/lib/api.ts`.** It throws `ApiError`; show it with
  `toast.error` (sonner).
- **Env:** `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`). Never put secrets in
  `NEXT_PUBLIC_*`; the Cala key belongs to `apps/api` only.
- `@repo/shared` is TypeScript source, compiled via `transpilePackages` in `next.config.ts`.
- `bun run typecheck` runs `next typegen` first (it generates `LayoutProps` and friends).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
