---
"nestjs-openapi": patch
---

OpenAPI 3.0 output (the default) now writes `string | number` properties as `anyOf` instead of an invalid type list, and drops scopes from security requirements on non-OAuth schemes with a warning. Nullable enums now allow `null` in every version. Tuples keep their element types: `prefixItems` in 3.1 and 3.2, and in 3.0 one `items` `anyOf` of the position types, which is lossy because 3.0 cannot say which position holds which type (`minItems` and `maxItems` still keep the length). Expected documents changed: primitive-union.3.0.3.json, nullable-enum.{3.0.3,3.1.0,3.2.0}.json, tuple.{3.0.3,3.1.0,3.2.0}.json, and new api-key-scopes.{3.0.3,3.1.0,3.2.0}.json under test/contract.
