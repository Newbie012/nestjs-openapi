---
"nestjs-openapi": minor
---

Emit `enum: [value]` instead of the JSON Schema `const` keyword, which OpenAPI only adopted in 3.1. Generated output changes: `{ "const": "paypal" }` is now `{ "enum": ["paypal"] }`.
