# nestjs-openapi

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
