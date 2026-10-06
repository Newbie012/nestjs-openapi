import { defineConfig } from '../../src/config.js';

export default defineConfig({
  extends: './openapi.config.ts',
  output: 'openapi.raw.generated.json',
  openapi: {
    info: {
      title: 'Regressions API',
      version: '1.0.0',
    },
  },
  options: {
    schemas: {
      genericNames: 'raw',
    },
  },
});
