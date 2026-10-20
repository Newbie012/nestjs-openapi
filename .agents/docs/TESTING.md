# Testing Guidelines

## Contracts

Output behavior is pinned by contract cases in `test/contract/<surface>/<feature>.spec.ts`. A case is NestJS source plus one committed expected document per OpenAPI version, so a change in output shows up as a diff.

```typescript
import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('nullable-enum', {
  spec: 'https://spec.openapis.org/oas/v3.1.0#schema-object',
  source: { 'app.controller.ts': `...` },
});
```

- **Options** — `contract(name, { spec, source? | fixture?, config?, rejects?, knownInvalid? })`. `spec` links the spec section the case pins.
- **Versions** — Every case runs at 3.0.3, 3.1.0 and 3.2.0. Expected documents live in `test/contract/<surface>/__contracts__/<name>.<version>.json`.
- **Validation** — Every document must also pass the official OpenAPI schema for its version.
- **`knownInvalid`** — Lists a version whose document fails validation today, with a reason and the plan that fixes it. The case fails when that version starts passing, so remove the entry then.
- **`rejects`** — For versions where generation must fail on purpose. Names the error tag.
- **Surfaces** — Folders mirror the spec's objects (`schemas`, `responses`, `components`, `parameters`, `paths`, `operations`, `security`, `root`). `naming`, `extensions`, `overlay` and `filtering` cover behavior only this tool has.
- **Source or fixture** — Prefer inline `source`. Use `fixture` for an app under `e2e-applications/`. A fixture case's `config` mirrors the fixture's own config.
- **Unsupported constructs** — Spec constructs the generator cannot emit yet are listed in `test/contract/UNSUPPORTED.md`. When one gets implemented, add its case and delete its line.

### Changing output

```bash
pnpm vitest run test/contract -u   # accept new output
```

Then review the `__contracts__` diff. That diff is the review artifact.

- A refactor leaves `__contracts__` unchanged. Any change there needs an explanation.
- A bug fix changes only the expected files it names.

### Tests that stay outside `test/contract/`

These check things that are not the document, so they stay as small `test/*.test.ts` files:

- `yaml-output-e2e`, `openapi-module-e2e`, `config-extends-smoke`, `overlay-file-smoke` — files on disk and the runtime module
- `computed-enums-e2e`, `naming-diagnostics-e2e`, `param-dto-diagnostics-e2e`, `multi-entry-diagnostics-e2e` — log warnings, error messages and counts
- `swagger-demo-e2e` — `OpenApiModule` swagger options

## Test Structure

- **Unit tests** (`src/**/*.test.ts`) — Next to the module they test, use in-memory ts-morph
- **Contract tests** (`test/contract/**/*.spec.ts`) — Full-document output per OpenAPI version, see above
- **Smoke tests** (`test/*.test.ts`) — Disk output and diagnostics, use fixture apps in `e2e-applications/`

## Running Tests

```bash
pnpm test              # All tests
pnpm test:watch        # Interactive watch mode
pnpm vitest run test/contract   # Contract cases only
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

## Writing Disk and Diagnostic Tests

New behavior that changes the document belongs in a contract case, not here. Use a `test/*.test.ts` file only for what a document cannot show, such as files written to disk, warnings or error messages:

```typescript
import { generate } from '../src/index.js';
import { resolve } from 'node:path';

describe('Feature smoke', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/my-app/openapi.config.ts'
  );

  it('should write the output file', async () => {
    const result = await generate(configPath);

    expect(result.pathCount).toBeGreaterThan(0);
  });
});
```

## Test Coverage Expectations

- All public API functions must have tests
- New decorators need both unit and contract coverage
- Edge cases should be covered (empty inputs, missing decorators, etc.)
