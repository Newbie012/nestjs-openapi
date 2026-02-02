import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.generated.json',
  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
  },
  openapi: {
    info: {
      title: 'Base API',
      version: '1.0.0',
      description: 'Base API description from parent config',
    },
    servers: [{ url: 'https://base.example.com' }],
  },
  options: {
    basePath: '/api/v1',
  },
});
