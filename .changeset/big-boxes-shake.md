---
"nestjs-openapi": patch
---

OpenAPI 3.1 and 3.2 output now writes the nullable values of maps (`Record<string, T | null>`), and schemas under `not` and `patternProperties`, in 3.1 form instead of leaving the 3.0-only `nullable`. Alias collapsing also rewrites refs under `not`, `patternProperties` and discriminator `mapping`. Expected documents changed: test/contract/schemas/__contracts__/record-nullable-values.{3.1.0,3.2.0}.json and nested-subschemas.{3.1.0,3.2.0}.json.
