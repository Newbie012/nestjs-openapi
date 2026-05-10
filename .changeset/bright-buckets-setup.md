---
"nestjs-openapi": minor
---

Add `OpenApiModule.setup()` for serving a generated OpenAPI spec from `main.ts`.

This lets apps register the docs and JSON routes after reading runtime config, without duplicating the file loading and Swagger UI route handlers. File-based setup can also try fallback spec paths, such as the matching `dist` path used after compilation.

Also fixes generated schemas for TypeScript optional properties.
