---
"nestjs-openapi": minor
---

Emit single-value `enum` instead of the JSON Schema `const` keyword.

`ts-json-schema-generator` emits `const` for any type with exactly one inhabitant — a string-literal property, a discriminated union's discriminator, or a single-member enum. OpenAPI only adopted `const` in 3.1, so a 3.0 spec carrying it is invalid, and tooling that does not know the keyword reads the schema as unconstrained. `enum: [value]` says the same thing, is valid in every OpenAPI version, and gives single- and multi-member enums the same shape.

This changes generated output: `{ "const": "credit_card" }` is now `{ "enum": ["credit_card"] }`. Specs committed to a repository will show that diff once on the next generation. An existing `enum` always wins, and no other keyword is touched.
