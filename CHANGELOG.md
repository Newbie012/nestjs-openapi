# nestjs-openapi-static

## 2.2.0

### Minor Changes

- [#5](https://github.com/Newbie012/nestjs-openapi-static/pull/5) [`1d00a9d`](https://github.com/Newbie012/nestjs-openapi-static/commit/1d00a9dad338731d47c86b56fec5d46046a73468) Thanks [@Newbie012](https://github.com/Newbie012)! - - Inline query DTO properties as individual parameters by default. Use `options.query.style: "ref"` for legacy behavior.
  - Add `additionalProperties: false` to object schemas for stricter validation.

## 2.1.0

### Minor Changes

- [#4](https://github.com/Newbie012/nestjs-openapi-static/pull/4) [`40529fb`](https://github.com/Newbie012/nestjs-openapi-static/commit/40529fb5ecb1ccda53a62aa08e09a7f6232277fc) Thanks [@Newbie012](https://github.com/Newbie012)! - Zero-config schema resolution with significant performance improvements.

  **Highlights:**
  - Zero-config schema discovery and hybrid resolution enabled by default
  - Major performance improvements for large monorepos
  - Schema validation warnings and exports
  - Type handling and import alias fixes
  - Improved configuration error messaging

## 2.0.0

### Major Changes

- [`ee70b13`](https://github.com/Newbie012/nestjs-openapi-static/commit/ee70b134e835cd32f9818a3cc8914a8d204c077d) Thanks [@Newbie012](https://github.com/Newbie012)! - Initial release of nestjs-openapi-static - static OpenAPI generation for NestJS applications using TypeScript AST analysis. No build step, no app bootstrap required.

  Features:
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
