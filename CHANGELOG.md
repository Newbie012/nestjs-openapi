# nestjs-openapi

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
