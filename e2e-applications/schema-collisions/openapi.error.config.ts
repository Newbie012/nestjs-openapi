import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  output: 'openapi.error.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'Schema Collisions API',
      version: '1.0.0',
    },
  },

  options: {
    schemaNameCollision: 'error',
  },
});
