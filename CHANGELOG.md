# nestjs-openapi

## 0.8.3

### Patch Changes

- A transparent wrapper alias such as TypeORM's `Relation<T>` (`type Relation<T> = T`) no longer adds a component per use: references point at `T` itself, without the alias's description. A wrapper kept with `aliasRefs: 'preserve'` is named after the declaration it wraps, never after the type checker's internal IDs.

## 0.8.2

### Patch Changes

- `@Param() params: SomeDto` now gives one path parameter per DTO property, as @nestjs/swagger does, instead of a single parameter named after the argument. A path parameter whose name is not in the route is left out with a warning.

- class-validator constraints given `{ each: true }` now apply to the array's `items` instead of the array. String keywords from class-validator (`minLength`, `maxLength`, `pattern` and string formats) are no longer written on schemas whose type isn't a string, so `@IsNotEmpty()` on a number adds nothing.

## 0.8.1

### Patch Changes

- A class that shares its name with a documented declaration no longer adds its class-validator metadata to that declaration's schema. Generation now reports a schema whose `required` lists a key its `properties` does not.

## 0.8.0

### Minor Changes

- Declarations that share a name are now one schema when their schemas are equal: two copies of a `MoneyDto`, or an interface and a class with the same fields, get one `MoneyDto` component and no warning, and `schemaNameCollision: 'error'` no longer fails on them. Generic instantiations are compared one by one, so `ChoiceDto<string>` from two identical `ChoiceDto<T>` declarations is one `ChoiceDto_string`, and only an instantiation whose bodies differ collides. Descriptions and examples count: copies documented differently still collide. The 'error' message now says where the schemas differ.

  Same-name enums with equal values are one component. An `enumName` given different values in different places is now a collision: 'error' fails, and the other strategies write those values in place.

  Output changes for existing users: with 'rename' or a naming function, equal copies go back to their plain name, and the function is only called for declarations that really differ. With 'inline', equal copies become a referenced component instead of being written in place.

### Patch Changes

- Fix an alias of an array, union or intersection, such as `type ItemList = ItemDto[]`, pointing at another declaration with the same name as its element. It now refers to the declaration it names.

## 0.7.0

### Minor Changes

- Generated specs are now checked against the official OpenAPI schema. A spec that breaks it is still written, but `validation.valid` is `false` and the CLI exits with code 1.

  Output changes for existing users: in 3.0, a nullable reference gets the `type` 3.0 requires beside `nullable`, and exclusive bounds use 3.0's boolean form. A property's `examples` array stays on a query parameter's schema instead of the parameter.

- Explicit decorator options now win, as in @nestjs/swagger: a declared `type` over the TypeScript type, a response `content` map over the return type, and computed keys such as `[PetKind.Cat]` are read instead of dropped.

  Output changes for existing users: object schemas no longer carry `additionalProperties: false`. Set `schemas.additionalProperties: 'forbid'` to keep it.

### Patch Changes

- Fix two broken refs: a generic with an inline object argument, such as `ApiResponse<{ sent: boolean }>`, is now written in place, and `Map<string, T>`, `Record<string, T>` and `Set<T>` become an object of `T` or an array of unique `T`.

## 0.6.0

### Minor Changes

- [#52](https://github.com/Newbie012/nestjs-openapi/pull/52) [`5fe0ef7`](https://github.com/Newbie012/nestjs-openapi/commit/5fe0ef71a79fa0de5f44ca6b4ed17903bd4c2cf2) Thanks [@Newbie012](https://github.com/Newbie012)! - Read @nestjs/swagger decorators faithfully and generate schemas faster.
  - Decorator arguments are evaluated statically (constants, enum members, concatenation, template literals, `Object.values`, array methods); unreadable values are reported.
  - `applyDecorators()` wrappers are followed; the new `decorators` option describes wrappers that cannot be followed.
  - `@ApiResponse` and its shortcuts, `@ApiBody`, `@ApiQuery`/`@ApiParam`/`@ApiHeader(s)`, `@ApiExtension`, `@ApiExtraModels`, `@ApiProperty` precedence and mapped types now match @nestjs/swagger.
  - Path arrays, `@Version()` and `@All()` are documented. New options: `versioning`, `transformPath`, `include`, `deepScanRoutes` and `enums`.
  - Schemas are generated in one TypeScript program per run, and a type the generator crashes on is recovered instead of dropped.

  Output changes for existing users: operations gain the responses, parameters and metadata their decorators declare, and `examples` follow the OpenAPI version.

- [#53](https://github.com/Newbie012/nestjs-openapi/pull/53) [`ef0d9be`](https://github.com/Newbie012/nestjs-openapi/commit/ef0d9be47b6331780e5858df7e2914bb8fe3d5a3) Thanks [@Newbie012](https://github.com/Newbie012)! - One schema per declaration, and spec-valid component names.

  Output changes for existing users:
  - Different declarations sharing a name (two files each declaring an `AddressDto`) no longer share one schema. By default each is written in place where it is used, with a warning; the new `schemaNameCollision` option can name them after their files (`'rename'`), use a naming function, or fail (`'error'`).
  - Generic instantiations get valid component names: `Page<User>` becomes `Page_User`. Set `schemas.genericNames: 'raw'` to keep the TypeScript names.
  - `MissingGenericSchemaTempFileWriteError` and `MissingGenericSchemaTempFileCleanupError` are no longer exported.

## 0.5.2

### Patch Changes

- [#48](https://github.com/Newbie012/nestjs-openapi/pull/48) [`0929ff3`](https://github.com/Newbie012/nestjs-openapi/commit/0929ff3fc58e52637c18d79a45a9213ecce18953) Thanks [@Newbie012](https://github.com/Newbie012)! - Point the package `homepage` at the documentation site and expand the npm `keywords`.

## 0.5.1

### Patch Changes

- [#45](https://github.com/Newbie012/nestjs-openapi/pull/45) [`8b492cd`](https://github.com/Newbie012/nestjs-openapi/commit/8b492cd746c1482db49b3c1ca60a92f42ed86c6c) Thanks [@Newbie012](https://github.com/Newbie012)! - Emit 3.1-native schema shapes when targeting OpenAPI 3.1+: `const` for single-value literals, a bare `$ref` inside the nullable union, and `contentMediaType`/`contentEncoding` instead of `format: binary`/`byte`. Output for 3.0.3 is unchanged.

## 0.5.0

### Minor Changes

- [#43](https://github.com/Newbie012/nestjs-openapi/pull/43) [`44dfd75`](https://github.com/Newbie012/nestjs-openapi/commit/44dfd75fd6cca5e7127e9787218bf9ed5133e839) Thanks [@Newbie012](https://github.com/Newbie012)! - Emit `enum: [value]` instead of the JSON Schema `const` keyword, which OpenAPI only adopted in 3.1. Generated output changes: `{ "const": "paypal" }` is now `{ "enum": ["paypal"] }`.

### Patch Changes

- [#43](https://github.com/Newbie012/nestjs-openapi/pull/43) [`44dfd75`](https://github.com/Newbie012/nestjs-openapi/commit/44dfd75fd6cca5e7127e9787218bf9ed5133e839) Thanks [@Newbie012](https://github.com/Newbie012)! - A parameter typed with a single-member enum now refs the enum instead of its member. TypeScript collapses the declared type to the member literal, so the ref pointed at a schema that never existed.

## 0.4.1

### Patch Changes

- [#40](https://github.com/Newbie012/nestjs-openapi/pull/40) [`4c2afd2`](https://github.com/Newbie012/nestjs-openapi/commit/4c2afd2ae491307691aa0bd5d869a2b528ac7ec2) Thanks [@Newbie012](https://github.com/Newbie012)! - Keep the success response for handlers that declare only error `@ApiResponse` codes.

  Previously, a handler without a return type (such as a `@HttpCode(204)` void `DELETE`) that declared only error responses via `@ApiResponse` lost its success response entirely, emitting just the error codes. The default success response is now always documented unless the handler already declares a 2xx response.

## 0.4.0

### Minor Changes

- [#38](https://github.com/Newbie012/nestjs-openapi/pull/38) [`31f6d7f`](https://github.com/Newbie012/nestjs-openapi/commit/31f6d7f89af6bfe9da0572facffa3f8e3062ab0e) Thanks [@Newbie012](https://github.com/Newbie012)! - Fix Swagger primitive array overrides for nullable schemas and query parameters.
  - Apply primitive `type` and `enum` overrides inside nullable `anyOf` array schemas.
  - Preserve array item overrides for query parameters.

## 0.3.2

### Patch Changes

- [#36](https://github.com/Newbie012/nestjs-openapi/pull/36) [`d14cdf1`](https://github.com/Newbie012/nestjs-openapi/commit/d14cdf1b110623ac564e76a846350be64b6c3ae7) Thanks [@Newbie012](https://github.com/Newbie012)! - Fix generated schemas for Swagger primitive array type overrides.

## 0.3.1

### Patch Changes

- [#34](https://github.com/Newbie012/nestjs-openapi/pull/34) [`669ea54`](https://github.com/Newbie012/nestjs-openapi/commit/669ea546af2d3991bf637ef623415f21f9456d90) Thanks [@Newbie012](https://github.com/Newbie012)! - Fix generated schemas for TypeScript optional properties.

## 0.3.0

### Minor Changes

- [#32](https://github.com/Newbie012/nestjs-openapi/pull/32) [`c910289`](https://github.com/Newbie012/nestjs-openapi/commit/c91028957bafed4b14059841005fb2c3d89632cb) Thanks [@Newbie012](https://github.com/Newbie012)! - Add `OpenApiModule.setup()` for serving a generated OpenAPI spec from `main.ts`.

  This lets apps register the docs and JSON routes after reading runtime config, without duplicating the file loading and Swagger UI route handlers. File-based setup can also try fallback spec paths, such as the matching `dist` path used after compilation.

## 0.2.2

### Patch Changes

- [#30](https://github.com/Newbie012/nestjs-openapi/pull/30) [`259f11d`](https://github.com/Newbie012/nestjs-openapi/commit/259f11d19fa8856bb775a6f5d906b2437092aa82) Thanks [@Newbie012](https://github.com/Newbie012)! - Stop generating placeholder descriptions for parameters and request bodies that do not have explicit descriptions.

## 0.2.1

### Patch Changes

- [#28](https://github.com/Newbie012/nestjs-openapi/pull/28) [`14d6ee9`](https://github.com/Newbie012/nestjs-openapi/commit/14d6ee9268aeb453cb1c663ef6bd33d6d8d715df) Thanks [@Newbie012](https://github.com/Newbie012)! - Fix `excludeDecorators` so controller-level decorators exclude all endpoints on the decorated controller.

## 0.2.0

### Minor Changes

- [#26](https://github.com/Newbie012/nestjs-openapi/pull/26) [`69b7eb9`](https://github.com/Newbie012/nestjs-openapi/commit/69b7eb9cb686e2820f57bd7863669c9784514715) Thanks [@Newbie012](https://github.com/Newbie012)! - - Improved generation performance via schema generation pipeline/batching updates.
  - Improved OpenAPI parity for decorator/config handling and schema extraction (including additional `@ApiProperty` enum coverage).
  - Improved runtime module error behavior: `loadSpecFile` now surfaces plain tagged errors instead of Effect wrapper failures.
  - Added/expanded public generation APIs (`generatePaths*`, `generateFromConfig*`, and related service exports).

## 0.1.4

### Patch Changes

- [#22](https://github.com/Newbie012/nestjs-openapi/pull/22) [`a1cac44`](https://github.com/Newbie012/nestjs-openapi/commit/a1cac440bf40736ceb8a433c1b91b6b518e3f52f) Thanks [@Newbie012](https://github.com/Newbie012)! - - Added `options.schemas.aliasRefs` with two modes: `"collapse"` and `"preserve"`.
  - Default behavior now collapses pass-through schema aliases (for example `A -> B -> C` becomes `A -> C` when `B` is a pure `$ref` alias).
  - Added `"preserve"` mode for consumers who want to keep alias schemas in `components.schemas`.

## 0.1.3

### Patch Changes

- [#20](https://github.com/Newbie012/nestjs-openapi/pull/20) [`e590f93`](https://github.com/Newbie012/nestjs-openapi/commit/e590f93e029fe5ebeea88eaefede173f969ac035) Thanks [@Newbie012](https://github.com/Newbie012)! - - CLI exits with non-zero when generated spec fails validation.
  - Config is found by walking up the directory tree (works from nested/monorepo paths).
  - Global + per-route security now produces correct combinations instead of one merged requirement.
  - Regex path filters are deterministic (no more paths appearing or disappearing by run order).
  - Default DTO discovery: `*.dto.ts`, `*.entity.ts`, `*.model.ts`, `*.schema.ts` when `files.dtoGlob` is unset.
  - OpenAPI 3.1: nullable fields in unions and combined schemas are translated correctly.

## 0.1.2

### Patch Changes

- [#18](https://github.com/Newbie012/nestjs-openapi/pull/18) [`60d2d5a`](https://github.com/Newbie012/nestjs-openapi/commit/60d2d5ad35d3a824636c7ba4fa3704c17c6e4241) Thanks [@Newbie012](https://github.com/Newbie012)! - Fix optional query parameters generating incorrect `oneOf` schemas with a spurious `object` branch.

  Handle `null` in union types by converting to `nullable: true` (OpenAPI 3.0) or `type: ["string", "null"]` (OpenAPI 3.1+) instead of discarding nullability information. Also normalize `ts-json-schema-generator` 3.1-style nullable output to canonical 3.0 format in schema merging, and extend version transforms to cover path-level schemas (parameters, requestBody, responses).

## 0.1.1

### Patch Changes

- [#15](https://github.com/Newbie012/nestjs-openapi/pull/15) [`ba68d0c`](https://github.com/Newbie012/nestjs-openapi/commit/ba68d0cd7fecb79fcaf5f8fe08fdf03a45da4f56) Thanks [@Newbie012](https://github.com/Newbie012)! - Fix non-PascalCase class names (e.g. `myResponseDto`) falling through to `{ type: 'object' }` instead of generating a proper `$ref`

## 0.1.0

Initial release of nestjs-openapi - static OpenAPI generation for NestJS applications using TypeScript AST analysis. No build step, no app bootstrap required.

### Features

- Static analysis of NestJS controllers and modules via ts-morph
- Full support for routing decorators (@Controller, @Get, @Post, etc.)
- Swagger decorator support (@ApiTags, @ApiOperation, @ApiResponse, etc.)
- Security decorator support (@ApiBearerAuth, @ApiOAuth2, etc.)
- class-validator constraint extraction
- Multiple entry module support
- Config inheritance via `extends`
- OpenAPI 3.0.3, 3.1.0, and 3.2.0 output
- JSON and YAML output formats
- Optional NestJS module to serve the generated spec at runtime
- Query DTO inlining as individual parameters
- Zero-config schema discovery
