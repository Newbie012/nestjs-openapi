# nestjs-openapi

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
