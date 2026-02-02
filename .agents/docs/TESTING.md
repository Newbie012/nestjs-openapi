# Testing Guidelines

## Test Structure

- **Unit tests** (`src/*.test.ts`) — Co-located with source, use in-memory ts-morph
- **E2E tests** (`test/*-e2e.test.ts`) — Use fixture apps in `e2e-applications/`

## Running Tests

```bash
pnpm test              # All tests (361 tests)
pnpm test:watch        # Interactive watch mode
pnpm test:e2e          # E2E tests only
```

## Writing Unit Tests

Use in-memory ts-morph projects to avoid filesystem dependencies:

```typescript
import { Project } from 'ts-morph';
import { describe, it, expect } from 'vitest';

describe('MyFeature', () => {
  it('should extract controller metadata', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('/test.ts', `
      import { Controller, Get } from '@nestjs/common';

      @Controller('users')
      export class UsersController {
        @Get()
        findAll() { return []; }
      }
    `);

    const result = extractMetadata(sourceFile);
    
    expect(result.path).toBe('/users');
    expect(result.methods).toHaveLength(1);
  });
});
```

## Writing E2E Tests

E2E tests use real fixture apps:

```typescript
import { generate } from '../src/generate.js';
import { resolve } from 'node:path';

describe('Feature E2E', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/my-app/openapi.config.ts'
  );

  it('should generate valid spec', async () => {
    const result = await generate(configPath);
    
    expect(result.pathCount).toBeGreaterThan(0);
    expect(result.operationCount).toBeGreaterThan(0);
  });
});
```

## Test Coverage Expectations

- All public API functions must have tests
- New decorators need both unit and E2E coverage
- Edge cases should be covered (empty inputs, missing decorators, etc.)

## Snapshot Testing

For complex output validation, use snapshots:

```typescript
it('should match snapshot', async () => {
  const result = await generate(configPath);
  const spec = JSON.parse(readFileSync(result.outputPath, 'utf-8'));
  
  expect(spec).toMatchSnapshot();
});
```

Update snapshots with: `pnpm test -- -u`
