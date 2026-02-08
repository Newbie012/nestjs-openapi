---
"nestjs-openapi": patch
---

Fix optional query parameters generating incorrect `oneOf` schemas with a spurious `object` branch.

Handle `null` in union types by converting to `nullable: true` (OpenAPI 3.0) or `type: ["string", "null"]` (OpenAPI 3.1+) instead of discarding nullability information. Also normalize `ts-json-schema-generator` 3.1-style nullable output to canonical 3.0 format in schema merging, and extend version transforms to cover path-level schemas (parameters, requestBody, responses).
