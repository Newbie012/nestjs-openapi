---
"nestjs-openapi": patch
---

- CLI exits with non-zero when generated spec fails validation.
- Config is found by walking up the directory tree (works from nested/monorepo paths).
- Global + per-route security now produces correct combinations instead of one merged requirement.
- Regex path filters are deterministic (no more paths appearing or disappearing by run order).
- Default DTO discovery: `*.dto.ts`, `*.entity.ts`, `*.model.ts`, `*.schema.ts` when `files.dtoGlob` is unset.
- OpenAPI 3.1: nullable fields in unions and combined schemas are translated correctly.
