# nestjs-openapi-static

Static OpenAPI generation for NestJS. Analyzes TypeScript source directly—no build step, no app bootstrap.

[![npm version](https://img.shields.io/npm/v/nestjs-openapi-static)](https://www.npmjs.com/package/nestjs-openapi-static)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Why static analysis?

|  | Runtime (`@nestjs/swagger`) | Static (`nestjs-openapi-static`) |
|---|---|---|
| Requires build | Yes | No |
| Requires app bootstrap | Yes | No |
| Preserves generics/unions | No | Yes |

## Quick start

```bash
pnpm add -D nestjs-openapi-static
```

Create `openapi.config.ts`:

```typescript
import { defineConfig } from 'nestjs-openapi-static';

export default defineConfig({
  output: 'openapi.json',
  files: {
    entry: 'src/app.module.ts',
  },
  openapi: {
    info: { title: 'My API', version: '1.0.0' },
  },
});
```

Generate:

```bash
npx nestjs-openapi-static generate
```

## Documentation

Full documentation: **[nestjs-openapi-static.dev](https://nestjs-openapi-static.dev)**

- [Configuration](https://nestjs-openapi-static.dev/docs/guides/configuration)
- [Security schemes](https://nestjs-openapi-static.dev/docs/guides/security)
- [Validation extraction](https://nestjs-openapi-static.dev/docs/guides/validation)
- [Serving specs at runtime](https://nestjs-openapi-static.dev/docs/guides/serving)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Sponsors

<a href="https://github.com/sponsors/Newbie012">
  <img src="https://cdn.jsdelivr.net/gh/newbie012/sponsors/sponsors.svg">
</a>

## License

[MIT](LICENSE)
