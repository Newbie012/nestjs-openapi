---
"nestjs-openapi": minor
---

Explicit decorator options now win, as in @nestjs/swagger: a declared `type` over the TypeScript type, a response `content` map over the return type, and computed keys such as `[PetKind.Cat]` are read instead of dropped.

Output changes for existing users: object schemas no longer carry `additionalProperties: false`. Set `schemas.additionalProperties: 'forbid'` to keep it.
