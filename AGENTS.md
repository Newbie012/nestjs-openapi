# Project Agent Guide

Static analysis tool that generates OpenAPI specifications from NestJS applications without runtime execution.

## Essentials

| Item | Value |
|------|-------|
| Package manager | pnpm 12 |
| Build | `pnpm build` |
| Quality gate | `pnpm typecheck && pnpm lint && pnpm knip && pnpm test && pnpm build && pnpm publint` |

## Key Constraints

- **Effect for errors** — Never `throw`, use `Effect.fail` with `Schema.TaggedError` (serializable)
- **Nested config only** — Use `openapi.info`, not flat `info` at root
- **ESM imports** — Always use `.js` extensions

## Releases

A change users would notice needs a change intent: `pnpm change` writes one to `.changeset/`. Merging to `main` releases the pending intents. A refactor, test or docs change needs none.

## Documentation

| Topic | Location |
|-------|----------|
| Architecture & file structure | [.agents/docs/ARCHITECTURE.md](.agents/docs/ARCHITECTURE.md) |
| Testing guidelines | [.agents/docs/TESTING.md](.agents/docs/TESTING.md) |
| Config structure | [.agents/docs/CONFIG.md](.agents/docs/CONFIG.md) |
| Code style & workflow | [.agents/docs/WORKFLOW.md](.agents/docs/WORKFLOW.md) |

## After Completing Any Task

```bash
pnpm typecheck && pnpm lint && pnpm knip && pnpm test && pnpm build && pnpm publint
```
