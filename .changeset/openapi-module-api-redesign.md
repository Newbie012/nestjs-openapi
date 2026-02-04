---
"nestjs-openapi-static": major
---

Redesign OpenApiModule API for better ergonomics

**BREAKING CHANGES:**

- Rename `filePath` to `specFile` for clarity
- Replace `serveSwaggerUi`, `swaggerUiPath`, `swaggerUiTitle` with unified `swagger` option:
  - `swagger: true` - Enable with defaults (path: '/api-docs', title from spec)
  - `swagger: { path?, title? }` - Enable with custom options
  - `swagger: false` or omit - Disable (default)

**Migration:**

```typescript
// Before
OpenApiModule.forRoot({
  filePath: 'openapi.json',
  serveSwaggerUi: true,
  swaggerUiPath: '/docs',
  swaggerUiTitle: 'My API',
})

// After
OpenApiModule.forRoot({
  specFile: 'openapi.json',
  swagger: { path: '/docs', title: 'My API' },
})
```

**Other changes:**

- Fix HTTP routing bug where dynamic controllers weren't mapped by NestJS
- Add `CONTROLLER_WATERMARK` metadata for proper controller recognition
- Set method metadata directly on function objects (matching NestJS internals)
- Add HTTP routing e2e tests with supertest
- Add new `swagger-demo` e2e application
- Export `SwaggerOptions` type
