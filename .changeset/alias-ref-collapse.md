---
"nestjs-openapi": patch
---

- Added `options.schemas.aliasRefs` with two modes: `"collapse"` and `"preserve"`.
- Default behavior now collapses pass-through schema aliases (for example `A -> B -> C` becomes `A -> C` when `B` is a pure `$ref` alias).
- Added `"preserve"` mode for consumers who want to keep alias schemas in `components.schemas`.
