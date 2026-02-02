# Code Style & Workflow

## Non-Negotiable Rules

1. **Effect for errors** — Never `throw`, use `Effect.fail` with `Data.TaggedError`
2. **Readonly types** — All interface properties must be `readonly`
3. **ESM imports** — Always use `.js` extensions in imports
4. **Functional style** — Prefer pure functions, avoid mutation
5. **No console.log** — Use `Effect.logDebug/Info/Warn` (CLI is the exception)

## Linting

```bash
pnpm lint        # Check
pnpm lint:fix    # Auto-fix
```

Rules:
- `@typescript-eslint/no-explicit-any`: warn (OK in tests)
- `no-console`: error (except `src/cli.ts`)

## Formatting

```bash
pnpm format        # Fix formatting
pnpm format:check  # Check only
```

Uses Prettier with project defaults.

## Commit Messages

Use [conventional commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `test:` — Tests
- `refactor:` — Code refactoring
- `chore:` — Maintenance

## Common Gotchas

### Import Extensions

Always use `.js` extensions, even for TypeScript files (ESM requirement):

```typescript
// Correct
import { foo } from './utils.js';

// Wrong
import { foo } from './utils';
import { foo } from './utils.ts';
```

### ts-morph Symbols

Symbols may be undefined. Always handle with nullish checks:

```typescript
const symbol = identifier.getSymbol();
if (!symbol) return Option.none();
```

### Schema Refs

Use readable names (`UserDto`), not hashes. The schema normalizer handles this.

### Config Paths

All paths are relative to the config file location, not `process.cwd()`.

### Decorator Arguments

Can be identifiers, literals, or objects — handle all cases:

```typescript
const arg = decorator.getArguments()[0];
if (Node.isStringLiteral(arg)) {
  // Handle string
} else if (Node.isObjectLiteralExpression(arg)) {
  // Handle object
} else if (Node.isIdentifier(arg)) {
  // Handle identifier reference
}
```

### Generic Types

Preserved in schema names: `PaginatedResponse<UserDto>` stays as-is.

### Empty CLI Chunk Warning

Expected during build — CLI exports nothing, unbuild warns about it.

## Quality Gate

Run before every commit:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm publint
```

All 361 tests must pass.
