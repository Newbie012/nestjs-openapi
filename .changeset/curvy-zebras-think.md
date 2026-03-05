---
"nestjs-openapi": minor
---

User-facing updates:

- Improved runtime module error behavior: `loadSpecFile` now surfaces plain tagged errors instead of Effect wrapper failures.
- Added/expanded public generation APIs (`generatePaths*`, `generateFromConfig*`, and related service exports).
- Improved OpenAPI parity for decorator/config handling and schema extraction (including additional `@ApiProperty` enum coverage).
- Improved generation performance via schema generation pipeline/batching updates.
