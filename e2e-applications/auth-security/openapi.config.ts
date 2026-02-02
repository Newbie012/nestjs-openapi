import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.generated.json',

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
});
