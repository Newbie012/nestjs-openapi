import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('swagger-demo', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#operation-object',
  fixture: 'swagger-demo',
  config: {
    files: {
      entry: 'src/app.module.ts',
      tsconfig: 'tsconfig.json',
      dtoGlob: 'src/**/*.dto.ts',
    },
    openapi: {
      info: {
        title: 'Users API',
        version: '1.0.0',
        description: 'Demo API showcasing Swagger UI integration',
      },
      tags: [{ name: 'users', description: 'User management endpoints' }],
    },
  },
});
