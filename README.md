# nestjs-openapi-static

Static OpenAPI generation for NestJS. Analyzes TypeScript source directly—no build step, no app bootstrap.

[![npm version](https://img.shields.io/npm/v/nestjs-openapi-static)](https://www.npmjs.com/package/nestjs-openapi-static)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Why static analysis?

|  | Runtime (`@nestjs/swagger`) | Static (`nestjs-openapi-static`) |
|---|---|---|
| Requires runtime execution | Yes | No |
| Requires app bootstrap | Yes | No |
| Preserves generics/unions | No | Yes |

## Who is this for?

- Teams who want accurate OpenAPI from TypeScript types without runtime metadata
- CI/CD pipelines that should not boot the app or require infrastructure
- Projects that want OpenAPI as a build artifact or committed output

## Compatibility

- NestJS 10 or 11 (decorator-based controllers)
- TypeScript 5+
- Node 20+

## Limitations

- Dynamic route registration at runtime is not supported
- Response shortcut decorators like `@ApiOkResponse()` are not read
- Controller versioning via `@Controller({ path, version })` is not supported

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

## Migration from @nestjs/swagger

1. Keep your controllers and route decorators as-is.
2. Move `DocumentBuilder` config into `openapi.config.ts`.
3. Replace response shortcuts with `@ApiResponse({ status: ... })`.
4. (Optional) Use `OpenApiModule` to serve the generated spec at runtime.

See the full guide in the docs.

## Documentation

Full documentation: **[nestjs-openapi-static.dev](https://nestjs-openapi-static.dev)**

- [Configuration](https://nestjs-openapi-static.dev/docs/guides/configuration)
- [Security schemes](https://nestjs-openapi-static.dev/docs/guides/security)
- [Validation extraction](https://nestjs-openapi-static.dev/docs/guides/validation)
- [Serving specs at runtime](https://nestjs-openapi-static.dev/docs/guides/serving)
- [Migration guide](https://nestjs-openapi-static.dev/docs/recipes/migration)
- [CI/CD recipe](https://nestjs-openapi-static.dev/docs/recipes/ci-cd)
- [FAQ](https://nestjs-openapi-static.dev/docs/faq)
- [Decorator support](https://nestjs-openapi-static.dev/docs/guides/decorators)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Sponsors

<a href="https://github.com/sponsors/Newbie012">
  <img src="https://cdn.jsdelivr.net/gh/newbie012/sponsors/sponsors.svg">
</a>

## License

[MIT](LICENSE)
