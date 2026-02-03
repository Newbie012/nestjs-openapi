# Architecture

## Overview

This tool performs static AST analysis to emit OpenAPI 3.0/3.1/3.2 specs from NestJS apps. Effect-TS powers the internals; the public API is Promise-based.

## How It Works

1. Create a ts-morph project from `files.entry` using the provided `tsconfig`
2. Traverse `@Module` graphs to collect controllers and HTTP methods
3. Extract routing + Swagger metadata into `MethodInfo` objects
4. Generate DTO schemas with `ts-json-schema-generator`, normalize names, merge `class-validator` constraints
5. Apply filters, prefix `basePath`, build OpenAPI paths, merge schemas + security, write output
6. Optional: `OpenApiModule` serves the generated spec and Swagger UI at runtime

## Source Code Organization

```
src/
├── index.ts              # Public API exports
├── internal.ts           # Internal utilities export  
├── cli.ts                # CLI entry point
├── generate.ts           # Main generation orchestration
├── config.ts             # Config loading and resolution
├── types.ts              # Public TypeScript interfaces
├── domain.ts             # Effect Schemas for validation
├── project.ts            # ts-morph project creation
├── modules.ts            # NestJS module traversal
├── controllers.ts        # Controller analysis utilities
├── methods.ts            # Controller method extraction
├── transformer.ts        # MethodInfo → OpenAPI transformation
├── filter.ts             # Path/decorator filtering
├── security.ts           # Security scheme building
├── security-decorators.ts # Security decorator extraction
├── schema-generator.ts   # JSON Schema generation
├── schema-merger.ts      # Schema merging and deduplication
├── schema-normalizer.ts  # Schema name normalization
├── schema-version-transformer.ts # OpenAPI version transforms
├── validation-mapper.ts  # class-validator → JSON Schema
├── ast.ts                # Generic AST utilities
├── nest-ast.ts           # NestJS-specific AST utilities
├── module.ts             # NestJS runtime module (OpenApiModule)
├── errors.ts             # Typed error definitions
└── *.test.ts             # Unit tests (co-located)
```

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
