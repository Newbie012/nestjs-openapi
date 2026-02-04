# Documentation Site

This folder contains the public docs site for `nestjs-openapi`, built with Next.js + Fumadocs.

## Run locally

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000. The docs use the root repo toolchain (Node 20+, pnpm 10+). Build and lint commands mirror Next defaults:

```bash
pnpm lint
pnpm build
```

## Content structure

- `content/docs/getting-started` — overview, install, quick start, comparison with `@nestjs/swagger`.
- `content/docs/guides` — configuration, decorators, validation, filtering, serving, security.
- `content/docs/recipes` — CI/CD, monorepo, Swagger UI hosting, client generation.
- `content/docs/api` — reference for `generate`, `defineConfig`, Nest module, types, and errors.
- `content/docs/index.mdx` — landing page and navigation ordering (see nearby `meta.json`).

Update `meta.json` files when adding pages to control ordering and groups. Use MDX; shared layout tweaks live in `lib/layout.shared.tsx`. The content loader is defined in `lib/source.ts` and `source.config.ts`.

## Notes for contributors

- Keep examples aligned with the nested config shape used by the library (`files`, `openapi`, `options`).
- Prefer short, copy-pastable snippets that match the current code defaults (tsconfig required, JSON output today).
- The `.next` directory is ignored and should not be committed; if it appears locally, remove it before pushing changes.
