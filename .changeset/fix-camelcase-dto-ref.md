---
"nestjs-openapi": patch
---

Fix non-PascalCase class names (e.g. `myResponseDto`) falling through to `{ type: 'object' }` instead of generating a proper `$ref`
