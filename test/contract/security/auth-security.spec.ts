import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('auth-security', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#security-scheme-object',
  fixture: 'auth-security',
  config: {
    files: {
      entry: 'src/app.module.ts',
      tsconfig: '../../tsconfig.json',
    },
    openapi: {
      info: {
        title: 'Auth Security API',
        version: '1.0.0',
        description: 'API demonstrating security schemes',
      },
      security: {
        schemes: [
          {
            name: 'bearerAuth',
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT Bearer token authentication',
          },
          {
            name: 'apiKey',
            type: 'apiKey',
            in: 'header',
            parameterName: 'X-API-Key',
            description: 'API key authentication',
          },
        ],
        global: [{ bearerAuth: [] }],
      },
    },
  },
});
