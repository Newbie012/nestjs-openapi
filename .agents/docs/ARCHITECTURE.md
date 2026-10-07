# Architecture

## Overview

This tool performs static AST analysis to emit OpenAPI 3.0/3.1/3.2 specs from NestJS apps. Effect-TS powers the internals; the public API is Promise-based.

## How It Works

1. Create a ts-morph project from `files.entry` using the provided `tsconfig`
2. Traverse `@Module` graphs to collect controllers and HTTP methods
3. Extract routing + Swagger metadata into `MethodInfo` objects. Every reader goes through `getEffectiveDecorators()` (`analysis/decorators.ts`), which expands `applyDecorators()` wrappers and `options.decorators` mappings into built-in decorator calls
4. Generate DTO schemas with `ts-json-schema-generator`, normalize names, merge `class-validator` constraints
5. Apply filters, prefix `basePath`, build OpenAPI paths, merge schemas + security, write output
6. Optional: `OpenApiModule` serves the generated spec and Swagger UI at runtime

## Source Code Organization

```
src/
├── index.ts, internal.ts, cli.ts, public-api.ts   # Entry points
├── config/        # User configuration
│   ├── config.ts             # Config loading and resolution
│   ├── types.ts              # Public TypeScript interfaces
│   └── errors.ts, error-message.ts # Typed errors
├── model/
│   └── domain.ts             # MethodInfo and the other Effect Schemas between stages
├── analysis/      # Reading the Nest app
│   ├── project.ts, run-project.ts # ts-morph projects (one per tsconfig per run)
│   ├── ast.ts, nest-ast.ts   # AST utilities
│   ├── static-value.ts       # Static evaluation of decorator arguments
│   ├── decorators.ts         # Effective decorators: expands applyDecorators() wrappers and config mappings
│   ├── modules.ts, controllers.ts, methods.ts, filter.ts # Module traversal, controllers, operations
│   ├── responses.ts, parameters.ts, http-status.ts # @ApiResponse/@ApiBody, @ApiQuery/@ApiParam/@ApiHeader(s)
│   ├── property-schema.ts    # @ApiProperty options → declared schema (Nest precedence)
│   ├── validation-mapper.ts  # class-validator and @ApiProperty metadata → schema constraints
│   ├── security-decorators.ts # Security decorator extraction
│   ├── mapped-types.ts       # PartialType / PickType / OmitType / IntersectionType schemas
│   └── declaration-references.ts # Declarations each operation reaches, by symbol
├── schema/        # Producing JSON Schemas
│   ├── schema-program.ts     # TypeScript programs for ts-json-schema-generator (in-memory transforms)
│   ├── schema-generator.ts   # Generation with crash recovery
│   ├── type-resolver.ts      # Finds types declared outside dtoGlob
│   ├── schema-identity.ts    # One schema per declaration: collision strategies, in-memory renames
│   ├── schema-normalizer.ts, schema-alias-collapser.ts, schema-inliner.ts # Names, aliases, inlining
│   ├── schema-merger.ts      # JSON Schema → OpenAPI components
│   ├── schema-const-expander.ts, schema-version-transformer.ts # Per-version shapes
│   └── spec-compliance.ts    # Valid component names, version-specific `examples`
├── document/      # Assembling and writing the spec
│   ├── generate.ts           # Main generation orchestration
│   ├── transformer.ts        # MethodInfo → OpenAPI operations
│   ├── security.ts           # Security scheme building
│   ├── spec-validator.ts     # Broken-ref validation
│   └── output-service.ts     # Serialization and writing
└── runtime/       # OpenApiModule and Effect layers
    └── module.ts, runtime-layer.ts, service-layer.ts
```

Unit tests (`*.test.ts`) sit next to the module they test. `*-service.ts` files wrap a module's functions as an Effect service and sit next to it.

## Test Applications

E2E tests use fixture apps in `e2e-applications/`:

- `monolith-todo-app/` — Multi-module app
- `microservices/` — Multiple services
- `auth-security/` — Security schemes
- `dto-validation/` — class-validator integration
- `complex-generics/` — Generic type patterns
- `exclude-decorators/` — Filtering tests
- `security-decorators/` — Security decorator testing
- `comparison-benchmark/` — Benchmark against @nestjs/swagger
- `openapi-module-demo/` — Runtime module serving
- `openapi-version-test/` — OpenAPI 3.0/3.1/3.2 testing
- `multi-entry/` — Multiple entry modules merged
- `config-extends/` — Config inheritance testing
- `inline-types/` — Inline return type extraction

## Adding New Features

| Feature Type | Files to Update |
|--------------|-----------------|
| Config option | `types.ts` → `domain.ts` → `config.ts` → `generate.ts` → tests |
| Decorator support | `methods.ts` → `transformer.ts` → tests |
| New error type | `errors.ts` (extend `Schema.TaggedError`) |
