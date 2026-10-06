---
'nestjs-openapi': minor
---

Read @nestjs/swagger decorators faithfully and generate schemas faster.

- Decorator arguments are evaluated statically (constants, enum members, concatenation, template literals, `Object.values`, array methods); unreadable values are reported.
- `applyDecorators()` wrappers are followed; the new `decorators` option describes wrappers that cannot be followed.
- `@ApiResponse` and its shortcuts, `@ApiBody`, `@ApiQuery`/`@ApiParam`/`@ApiHeader(s)`, `@ApiExtension`, `@ApiExtraModels`, `@ApiProperty` precedence and mapped types now match @nestjs/swagger.
- Path arrays, `@Version()` and `@All()` are documented. New options: `versioning`, `transformPath`, `include`, `deepScanRoutes` and `enums`.
- Schemas are generated in one TypeScript program per run, and a type the generator crashes on is recovered instead of dropped.

Output changes for existing users: operations gain the responses, parameters and metadata their decorators declare, and `examples` follow the OpenAPI version.
