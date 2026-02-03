import { defineConfig } from '../../src/index.js';

export default defineConfig({
  output: 'openapi.json',
  format: 'json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: './tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'Import Alias Test API',
      version: '1.0.0',
      description:
        'Tests for import alias resolution and built-in type handling',
    },
  },
});
