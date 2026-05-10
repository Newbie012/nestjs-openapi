---
"nestjs-openapi": minor
---

Fix Swagger primitive array overrides for nullable schemas and query parameters.

- Apply primitive `type` and `enum` overrides inside nullable `anyOf` array schemas.
- Preserve array item overrides for query parameters.
