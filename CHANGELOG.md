# nestjs-openapi-static

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
