---
"nestjs-openapi": patch
---

Reference the enum declaration, not its member, for single-member enum parameters.

A parameter typed with a single-member enum (`@Query('channel') channel: Channel` where `Channel` has one member) produced `$ref: '#/components/schemas/Email'` — the member's name — and no schema was ever emitted under either name. TypeScript collapses the declared type of a one-member enum to that member's literal type, so the type's symbol is the enum member rather than the enum. Parameter naming now walks up to the enum declaration, so the ref points at the enum and resolves to a generated schema.

The dangling ref could also be silently masked: if an unrelated schema happened to share the member's name, the parameter resolved to that schema instead, producing a valid spec that typed the parameter as something completely different.
