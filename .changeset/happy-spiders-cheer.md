---
"nestjs-openapi": patch
---

An enum member, a union of enum members, and `Record` or `Partial<Record>` keyed by an enum now keep their values when used directly as a parameter, body or return type. A union of members is an enum of those values, a single member is a single value (`const` from 3.1), and an enum-keyed record lists one property per enum value, required unless wrapped in `Partial`. Before, they came out as `type: object` or a `oneOf` of objects. Plain string or number literal unions used directly in operation parameters, bodies and return types are now written as an `enum` instead of a `oneOf` of objects.
