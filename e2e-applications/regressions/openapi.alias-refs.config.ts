import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  extends: './openapi.config.ts',
  output: 'openapi.alias-refs.generated.json',
  openapi: {
    info: {
      title: 'Regressions API',
      version: '1.0.0',
    },
  },
  options: {
    schemas: {
      aliasRefs: 'preserve',
    },
  },
});
