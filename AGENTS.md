# Project Agent Guide

Static analysis tool that generates OpenAPI specifications from NestJS applications without runtime execution.

## Essentials

| Item | Value |
|------|-------|
| Package manager | pnpm 10+ |
| Build | `pnpm build` |
| Test count | 361 tests |
| Quality gate | `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm publint` |

## Key Constraints

- **Effect for errors** — Never `throw`, use `Effect.fail` with `Data.TaggedError`
- **Nested config only** — Use `openapi.info`, not flat `info` at root
- **ESM imports** — Always use `.js` extensions

## Documentation

| Topic | Location |
|-------|----------|
| Architecture & file structure | [.agents/docs/ARCHITECTURE.md](.agents/docs/ARCHITECTURE.md) |
| Testing guidelines | [.agents/docs/TESTING.md](.agents/docs/TESTING.md) |
| Config structure | [.agents/docs/CONFIG.md](.agents/docs/CONFIG.md) |
| Code style & workflow | [.agents/docs/WORKFLOW.md](.agents/docs/WORKFLOW.md) |

## After Completing Any Task

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm publint
```
