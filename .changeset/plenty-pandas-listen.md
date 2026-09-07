---
"nestjs-openapi": patch
---

A parameter typed with a single-member enum now refs the enum instead of its member. TypeScript collapses the declared type to the member literal, so the ref pointed at a schema that never existed.
