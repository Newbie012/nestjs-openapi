---
"nestjs-openapi": minor
---

Fix Swagger primitive array overrides for nullable schemas and query parameters, and refactor the transformer and validation mapper into Effect.Service classes.

- Apply primitive `type` and `enum` overrides inside nullable `anyOf` array schemas.
- Preserve array item overrides for query parameters.
- Add `TransformerService` and `ValidationMapperService` as public Effect services with span annotations; existing standalone helpers remain available.
- `ValidationService` is retained as a backward-compatible alias for `ValidationMapperService`.
