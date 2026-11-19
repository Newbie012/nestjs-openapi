---
"nestjs-openapi": minor
---

Several security decorators on one controller or method now list one security requirement each, so any one of them is enough, as @nestjs/swagger does. Before, `@ApiBearerAuth()` with `@ApiSecurity('apiKey')` gave `[{ bearer: [], apiKey: [] }]`, which requires both; it now gives `[{ bearer: [] }, { apiKey: [] }]`. To require several schemes together, use the object form, `@ApiSecurity({ apiKey: [], clientId: [] })`, which is now read, also through `applyDecorators`.
