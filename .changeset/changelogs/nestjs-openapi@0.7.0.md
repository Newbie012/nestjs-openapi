## 0.7.0

### Minor Changes

- Generated specs are now checked against the official OpenAPI schema. A spec that breaks it is still written, but `validation.valid` is `false` and the CLI exits with code 1.

  Output changes for existing users: in 3.0, a nullable reference gets the `type` 3.0 requires beside `nullable`, and exclusive bounds use 3.0's boolean form. A property's `examples` array stays on a query parameter's schema instead of the parameter.

- Explicit decorator options now win, as in @nestjs/swagger: a declared `type` over the TypeScript type, a response `content` map over the return type, and computed keys such as `[PetKind.Cat]` are read instead of dropped.

  Output changes for existing users: object schemas no longer carry `additionalProperties: false`. Set `schemas.additionalProperties: 'forbid'` to keep it.

### Patch Changes

- Fix two broken refs: a generic with an inline object argument, such as `ApiResponse<{ sent: boolean }>`, is now written in place, and `Map<string, T>`, `Record<string, T>` and `Set<T>` become an object of `T` or an array of unique `T`.
