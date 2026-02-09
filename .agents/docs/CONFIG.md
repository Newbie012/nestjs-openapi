# Configuration Structure

## Critical: Nested Structure Only

Always use the **nested config structure**. The flat structure is not supported.

```typescript
import { defineConfig } from 'nestjs-openapi';

// CORRECT - nested structure
export default defineConfig({
  output: 'openapi.json',
  format: 'json', // or 'yaml'
  
  files: {
    entry: 'src/app.module.ts',
    tsconfig: 'tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
    include: [],
    exclude: ['**/*.spec.ts'],
  },
  
  openapi: {
    version: '3.0.3', // or '3.1.0', '3.2.0'
    info: {
      title: 'My API',
      version: '1.0.0',
      description: 'API description',
    },
    servers: [{ url: 'http://localhost:3000' }],
    tags: [{ name: 'users', description: 'User operations' }],
    security: {
      schemes: [
        { name: 'bearer', type: 'http', scheme: 'bearer' },
      ],
      global: [{ bearer: [] }],
    },
  },
  
  options: {
    basePath: '/api',
    extractValidation: true,
    excludeDecorators: ['ApiExcludeEndpoint', 'ApiExcludeController'],
    pathFilter: /^(?!.*\/internal\/).*/,
  },
});
```

```typescript
// WRONG - flat structure (DO NOT USE)
export default defineConfig({
  entry: '...',        // NO - use files.entry
  info: { ... },       // NO - use openapi.info
  security: [ ... ],   // NO - use openapi.security
});
```

## Config Options Reference

### Root Level

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `output` | `string` | Yes | — | Output file path |
| `format` | `'json' \| 'yaml'` | No | `'json'` | Output format |
| `extends` | `string` | No | — | Extend another config |

### `files`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entry` | `string \| string[]` | `'src/app.module.ts'` | Entry module(s) |
| `tsconfig` | `string` | auto-detected | Path to tsconfig.json |
| `dtoGlob` | `string \| string[]` | — | Glob for DTO files |
| `include` | `string[]` | `[]` | Additional includes |
| `exclude` | `string[]` | `['**/*.spec.ts', ...]` | Exclusions |

#### tsconfig Auto-Detection

When `files.tsconfig` is omitted, the Promise API (`generate()`) searches upward from the entry file directory until it finds a `tsconfig.json`. If none is found, an error is thrown.

**Recommendation**: Always specify `files.tsconfig` explicitly for predictable behavior, especially in monorepos or workspaces with multiple tsconfigs.

> **Note**: The internal Effect API (`nestjs-openapi/internal`) requires `tsconfig` to be provided explicitly—no auto-detection is performed. This is by design for explicit dependency tracking in Effect programs.

### `openapi`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `version` | `'3.0.3' \| '3.1.0' \| '3.2.0'` | No | OpenAPI version (default: 3.0.3) |
| `info` | `InfoConfig` | Yes | API metadata |
| `servers` | `ServerConfig[]` | No | Server URLs |
| `tags` | `TagConfig[]` | No | Tag definitions |
| `security` | `SecurityConfig` | No | Security configuration |

### `options`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `basePath` | `string` | — | Global route prefix |
| `extractValidation` | `boolean` | `true` | Extract class-validator constraints |
| `excludeDecorators` | `string[]` | `['ApiExcludeEndpoint', 'ApiExcludeController']` | Exclusion decorators |
| `pathFilter` | `RegExp \| Function` | — | Filter routes |
| `query.style` | `"inline" \| "ref"` | `"inline"` | How to represent query DTOs |
| `schemas.aliasRefs` | `"collapse" \| "preserve"` | `"collapse"` | Collapse pass-through `$ref` aliases |

#### Query DTO Style

By default (`style: "inline"`), when `@Query()` is used without an explicit parameter name (e.g., `@Query() pagination: PaginationDto`), the DTO properties are **inlined as individual query parameters**. This is the standard OpenAPI practice.

```typescript
// Controller code:
@Get()
findAll(@Query() pagination: PaginationDto) { ... }

// Generated OpenAPI (style: "inline" - default):
parameters:
  - name: page
    in: query
    required: false
  - name: limit
    in: query
    required: false
```

Set `query.style: "ref"` to keep the entire query object as a single schema reference:

```typescript
options: {
  query: { style: 'ref' },
}

// Generated OpenAPI (style: "ref"):
parameters:
  - name: pagination
    in: query
    schema:
      $ref: '#/components/schemas/PaginationDto'
```

#### Schema Alias Refs

Use `schemas.aliasRefs` to control how pass-through alias schemas are emitted:

```typescript
options: {
  schemas: { aliasRefs: 'collapse' }, // default
}
```

- `"collapse"` rewrites `A -> B -> C` to `A -> C` when `B` is just a `$ref` alias (plus optional description), and removes `B`.
- `"preserve"` keeps alias schemas in `components.schemas`.

#### Validation Extraction

When `extractValidation` is enabled (default), the following `class-validator` decorators are mapped to OpenAPI constraints:

- **Type:** `@IsString`, `@IsNumber`, `@IsInt`, `@IsBoolean`, `@IsArray`, `@IsObject`, `@IsDate`
- **Format:** `@IsEmail`, `@IsUrl`, `@IsUUID`, `@IsDateString`, `@IsISO8601`
- **String:** `@MinLength`, `@MaxLength`, `@Length`, `@Matches`
- **Number:** `@Min`, `@Max`, `@IsPositive`, `@IsNegative`
- **Array:** `@ArrayMinSize`, `@ArrayMaxSize`
- **Enum:** `@IsEnum(MyEnum)` — extracts enum values even when property type is `string`
- **Optional:** `@IsOptional` — removes property from `required` array

## Path Resolution

All paths in config are **relative to the config file location**, not the current working directory.

## Config Inheritance (`extends`)

Use `extends` to inherit from a base config. Child values override parent values (deep merge).

```typescript
// base.config.ts
export default defineConfig({
  output: 'openapi.json',
  files: { tsconfig: 'tsconfig.json' },
  openapi: {
    info: { title: 'Base API', version: '1.0.0', description: 'Base description' },
    servers: [{ url: 'https://api.example.com' }],
  },
  options: { basePath: '/api' },
});

// openapi.config.ts
export default defineConfig({
  extends: './base.config.ts',
  output: 'openapi.json', // Required by types, will use parent value
  openapi: {
    info: { title: 'My API', version: '2.0.0' },
    // description, servers inherited from base
  },
  // options.basePath inherited from base
});
```

Extends chain is resolved recursively. Circular references are detected and rejected.

## Multiple Entry Modules

Use an array of entry modules to merge specs from multiple modules:

```typescript
export default defineConfig({
  output: 'openapi.json',
  files: {
    entry: [
      'src/users/users.module.ts',
      'src/products/products.module.ts',
    ],
    tsconfig: 'tsconfig.json',
  },
  openapi: { info: { title: 'Combined API', version: '1.0.0' } },
});
```

Duplicate paths (same HTTP method + path) are deduplicated (first wins).
