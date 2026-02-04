<div align="center">
  <img src="docs/public/logo.png" alt="nestjs-openapi" width="120" />
  <h1>nestjs-openapi</h1>
  <p>Static OpenAPI generation for NestJS.<br/>Analyzes TypeScript source directly—no build step, no app bootstrap.</p>

  [![npm version](https://img.shields.io/npm/v/nestjs-openapi)](https://www.npmjs.com/package/nestjs-openapi)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

  <a href="https://nestjs-openapi.dev">Documentation</a> · <a href="https://nestjs-openapi.dev/docs/quick-start">Quick Start</a> · <a href="https://github.com/Newbie012/nestjs-openapi/issues">Report Bug</a>
</div>

<br/>

## Motivation

`@nestjs/swagger` relies on `reflect-metadata` at runtime, which only exposes basic type signatures. Unions, generics, and literal types are erased. To work around this, you duplicate type information in decorators:

```typescript
// You already have this type
status: 'pending' | 'shipped' | 'delivered';

// But you also need this decorator to make the spec accurate
@ApiProperty({ enum: ['pending', 'shipped', 'delivered'] })
status: 'pending' | 'shipped' | 'delivered';
```

When they drift apart, your spec lies about your API.

**nestjs-openapi** reads your TypeScript source directly using the AST. Your types are your spec—no duplication, no drift.

## Quick start

```bash
pnpm add -D nestjs-openapi
```

Create `openapi.config.ts`:

```typescript
import { defineConfig } from 'nestjs-openapi';

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
npx nestjs-openapi generate
```

## Documentation

Full documentation at **[nestjs-openapi.dev](https://nestjs-openapi.dev)**

- [Configuration](https://nestjs-openapi.dev/docs/guides/configuration)
- [Security schemes](https://nestjs-openapi.dev/docs/guides/security)
- [Serving specs at runtime](https://nestjs-openapi.dev/docs/guides/serving)
- [Migration from @nestjs/swagger](https://nestjs-openapi.dev/docs/recipes/migration)
- [CI/CD recipe](https://nestjs-openapi.dev/docs/recipes/ci-cd)
- [FAQ](https://nestjs-openapi.dev/docs/faq)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Sponsors

<a href="https://github.com/sponsors/Newbie012">
  <img src="https://cdn.jsdelivr.net/gh/newbie012/sponsors/sponsors.svg">
</a>

## License

[MIT](LICENSE)
