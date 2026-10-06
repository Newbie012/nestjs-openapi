import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.inline.generated.json',

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
});
