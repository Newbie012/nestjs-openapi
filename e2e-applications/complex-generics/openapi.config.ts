import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../../tsconfig.json',
    dtoGlob: 'src/**/dto.ts',
  },

  openapi: {
    info: {
      title: 'Complex Generics API',
      version: '1.0.0',
      description: 'API demonstrating complex generic type patterns',
    },
  },
});
