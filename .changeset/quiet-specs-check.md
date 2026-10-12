---
"nestjs-openapi": minor
---

Generated specs are now checked against the official OpenAPI schema. A spec that breaks it is still written, but `validation.valid` is `false` and the CLI exits with code 1.

Output changes for existing users: in 3.0, a nullable reference gets the `type` 3.0 requires beside `nullable`, and exclusive bounds use 3.0's boolean form. A property's `examples` array stays on a query parameter's schema instead of the parameter.
